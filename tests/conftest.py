import asyncio
import inspect
import os
import sqlite3
import sys
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Generator, Iterator, List

import pytest
import sqlalchemy as sa
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

# Ensure the repository root is on sys.path so tests can import the backend package
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

import types
import importlib
import importlib.util
from pathlib import Path

import sqlite3

db_module = types.ModuleType('backend.db')
db_module.__path__ = []  # type: ignore[attr-defined]
db_module.DATABASE_PATH = Path(':memory:')


def _get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(':memory:', check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def _get_session():  # pragma: no cover - should be overridden in tests
    raise RuntimeError('get_session dependency must be overridden in tests')


def _initialise_schema(conn: sqlite3.Connection) -> None:  # pragma: no cover - no-op for tests
    return None


def _resolve_session_connection(session):  # pragma: no cover - minimal fallback
    if hasattr(session, 'connection'):
        try:
            return session.connection().connection
        except Exception:
            return session
    return session


db_module.get_connection = _get_connection
db_module.get_session = _get_session
db_module.initialise_schema = _initialise_schema
db_module.resolve_session_connection = _resolve_session_connection
db_module.get_sync_connection = lambda: None
models_path = Path(ROOT) / 'backend' / 'db' / 'models.py'
spec = importlib.util.spec_from_file_location('backend.db.models', models_path)
assert spec and spec.loader
models_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(models_module)  # type: ignore[union-attr]
sys.modules['backend.db.models'] = models_module
db_module.models = models_module
config_path = Path(ROOT) / 'backend' / 'db' / 'config.py'
config_spec = importlib.util.spec_from_file_location('backend.db.config', config_path)
if config_spec and config_spec.loader:
    config_module = importlib.util.module_from_spec(config_spec)
    sys.modules['backend.db.config'] = config_module
    config_spec.loader.exec_module(config_module)  # type: ignore[union-attr]
    db_module.config = config_module
    db_module.get_database_settings = config_module.get_database_settings
sys.modules['backend.db'] = db_module


if 'backend.database_legacy' not in sys.modules:
    try:
        importlib.import_module('backend.database_legacy')
    except Exception:
        sys.modules.pop('backend.database_legacy', None)
        db_legacy = types.ModuleType('backend.database_legacy')

        def _resolve_session_connection(session):
            if hasattr(session, 'connection'):
                try:
                    return session.connection().connection
                except Exception:
                    return session
            return session

        def _get_sync_connection():
            return None

        db_legacy.resolve_session_connection = _resolve_session_connection
        db_legacy.get_sync_connection = _get_sync_connection
        db_legacy.DATA_DIR = Path('.')
        sys.modules['backend.database_legacy'] = db_legacy


if 'backend.scheduling' not in sys.modules:
    try:
        scheduling_module = importlib.import_module('backend.scheduling')
    except Exception:
        scheduling_stub = types.SimpleNamespace(
            DEFAULT_EVENT_SUMMARY="",
            export_ics=lambda *args, **kwargs: None,
            recommend_follow_up=lambda *args, **kwargs: [],
            create_appointment=lambda *args, **kwargs: None,
            list_appointments=lambda *args, **kwargs: [],
            export_appointment_ics=lambda *args, **kwargs: None,
            get_appointment=lambda *args, **kwargs: None,
            apply_bulk_operations=lambda *args, **kwargs: (0, 0),
            reset_state=lambda: None,
            configure_database=lambda *args, **kwargs: None,
            schedule_session_scope=lambda *args, **kwargs: (_ for _ in ()).throw(
                RuntimeError('schedule_session_scope unavailable in test stub')
            ),
        )
        sys.modules['backend.scheduling'] = scheduling_stub
    else:
        sys.modules['backend.scheduling'] = scheduling_module

import backend.scheduling as scheduling_module

def _env_flag(name: str) -> bool:
    return os.getenv(name, '0').lower() in {'1', 'true', 'yes'}


def pytest_addoption(parser: pytest.Parser) -> None:
    parser.addoption(
        '--run-postgres',
        action='store_true',
        default=_env_flag('RUN_PG_TESTS'),
        dest='run_postgres',
        help='Execute tests marked with @pytest.mark.postgres that require PostgreSQL.',
    )


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line(
        'markers',
        'postgres: Tests that require a PostgreSQL database and are skipped unless '
        'RUN_PG_TESTS=1 or --run-postgres is provided.',
    )


def pytest_collection_modifyitems(config: pytest.Config, items: List[pytest.Item]) -> None:
    if config.getoption('run_postgres'):
        return
    skip_marker = pytest.mark.skip(reason='Requires PostgreSQL. Set RUN_PG_TESTS=1 or pass --run-postgres to enable.')
    for item in items:
        if 'postgres' in item.keywords:
            item.add_marker(skip_marker)

try:
    import pytest_asyncio  # type: ignore  # noqa: F401
except ImportError:

    @pytest.hookimpl(tryfirst=True)
    def pytest_pyfunc_call(pyfuncitem):
        """Run ``async def`` tests via ``asyncio.run`` when pytest-asyncio is missing."""

        if inspect.iscoroutinefunction(pyfuncitem.obj):
            testargs = {
                name: pyfuncitem.funcargs[name]
                for name in pyfuncitem._fixtureinfo.argnames
            }
            asyncio.run(pyfuncitem.obj(**testargs))
            return True
        return None

_now_iso = datetime.now(timezone.utc).isoformat()
os.environ.setdefault('ENVIRONMENT', 'development')
os.environ.setdefault('JWT_SECRET', 'test-jwt-secret')
os.environ.setdefault('JWT_SECRET_ROTATED_AT', _now_iso)
os.environ.setdefault('OPENAI_API_KEY', 'sk-test-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
os.environ.setdefault('OPENAI_API_KEY_ROTATED_AT', _now_iso)


@dataclass
class DatabaseContext:
    """Holds state for the ephemeral in-memory SQLite database."""

    engine: sa.engine.Engine
    connection: sa.engine.Connection
    raw_connection: sqlite3.Connection
    session_factory: sessionmaker

    def make_session(self) -> Session:
        """Return a new SQLAlchemy session bound to the in-memory engine."""

        return self.session_factory()


@pytest.fixture(scope='function')
def in_memory_db() -> Iterator[DatabaseContext]:
    """Provide an isolated in-memory SQLite database for each test."""

    from backend import main

    engine = sa.create_engine(
        'sqlite+pysqlite:///:memory:',
        future=True,
        connect_args={'check_same_thread': False},
        poolclass=StaticPool,
    )
    connection = engine.connect()
    raw_connection = connection.connection
    if hasattr(raw_connection, "driver_connection"):
        raw_connection = raw_connection.driver_connection
    elif hasattr(raw_connection, "connection"):
        raw_connection = raw_connection.connection
    assert isinstance(raw_connection, sqlite3.Connection)
    raw_connection.row_factory = sqlite3.Row

    previous = getattr(main, 'db_conn', None)
    main.reset_compose_workers_for_tests()
    if isinstance(previous, sqlite3.Connection):
        try:
            previous.close()
        except Exception:
            pass

    main.db_conn = raw_connection
    main.configure_auth_session_factory(raw_connection)
    main._init_core_tables(raw_connection)
    main.notification_counts = main.NotificationStore()
    main.events = []
    main.transcript_history = defaultdict(lambda: deque(maxlen=main.TRANSCRIPT_HISTORY_LIMIT))

    from backend import db as db_module

    def _session_dependency() -> Generator[Session, None, None]:
        session = session_factory()
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    main.app.dependency_overrides[db_module.get_session] = _session_dependency

    session_factory = sessionmaker(
        bind=engine,
        autoflush=False,
        expire_on_commit=False,
        future=True,
    )

    scheduling_module.configure_database(session_factory)
    scheduling_module.reset_state()

    context = DatabaseContext(
        engine=engine,
        connection=connection,
        raw_connection=raw_connection,
        session_factory=session_factory,
    )

    try:
        yield context
    finally:
        session_factory.close_all()

        from backend import db as db_module

        main.app.dependency_overrides.pop(main.get_db, None)
        main.app.dependency_overrides.pop(db_module.get_session, None)

        try:
            raw_connection.close()
        except Exception:
            pass
        connection.close()
        engine.dispose()


@pytest.fixture(scope='function')
def db_session(in_memory_db: DatabaseContext) -> Iterator[Session]:
    """Yield a SQLAlchemy session tied to the in-memory database."""

    session = in_memory_db.make_session()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(scope='function')
def api_client(in_memory_db: DatabaseContext) -> Iterator[TestClient]:
    """Yield a FastAPI test client bound to the in-memory database."""

    from backend import main

    with TestClient(main.app) as client:
        yield client


@pytest.fixture(scope='function')
def admin_user(db_session) -> str:
    """Create a default administrator account for tests."""

    from backend import auth, main

    with main.auth_session_scope() as session:
        auth.register_user(session, 'admin', 'secret', 'admin')
    return 'admin'


@pytest.fixture(scope='session')
def sqlalchemy_database_url(pytestconfig: pytest.Config, request: pytest.FixtureRequest) -> str:
    explicit = os.getenv('TEST_DATABASE_URL')
    if explicit:
        return explicit
    if pytestconfig.getoption('run_postgres'):
        try:
            postgresql_proc = request.getfixturevalue('postgresql_proc')
        except pytest.FixtureLookupError:
            pytest.skip('PostgreSQL tests requested but pytest-postgresql is not installed.')
        else:
            return (
                f"postgresql+psycopg://{postgresql_proc.user}:{postgresql_proc.password}"
                f"@{postgresql_proc.host}:{postgresql_proc.port}/{postgresql_proc.dbname}"
            )
    return 'sqlite+pysqlite:///:memory:'


@pytest.fixture(scope='session')
def sqlalchemy_engine(sqlalchemy_database_url: str) -> Iterator[sa.Engine]:
    engine_kwargs: dict[str, object] = {'future': True, 'pool_pre_ping': True}
    if sqlalchemy_database_url.startswith('sqlite'):
        engine_kwargs['connect_args'] = {'check_same_thread': False}
        engine_kwargs['poolclass'] = StaticPool
    engine = sa.create_engine(sqlalchemy_database_url, **engine_kwargs)
    try:
        yield engine
    finally:
        engine.dispose()


@pytest.fixture(scope='session')
def prepare_database(sqlalchemy_engine: sa.Engine, sqlalchemy_database_url: str) -> Iterator[None]:
    from backend.db.models import Base

    if sqlalchemy_database_url.startswith('postgres'):
        from alembic import command as alembic_command
        from alembic.config import Config as AlembicConfig

        config_path = os.path.join(ROOT, 'backend', 'alembic', 'alembic.ini')
        cfg = AlembicConfig(config_path)
        cfg.set_main_option('script_location', os.path.join(ROOT, 'backend', 'alembic'))
        cfg.set_main_option('sqlalchemy.url', sqlalchemy_database_url)
        alembic_command.upgrade(cfg, 'head')
        try:
            yield
        finally:
            Base.metadata.drop_all(sqlalchemy_engine)
        return

    Base.metadata.create_all(sqlalchemy_engine)
    try:
        yield
    finally:
        Base.metadata.drop_all(sqlalchemy_engine)


@pytest.fixture(scope='function')
def orm_session(prepare_database: None, sqlalchemy_engine: sa.Engine) -> Iterator[Session]:
    connection = sqlalchemy_engine.connect()
    transaction = connection.begin()
    SessionFactory = sessionmaker(bind=connection, autoflush=False, expire_on_commit=False, future=True)
    session = SessionFactory()
    try:
        yield session
        session.flush()
    finally:
        session.close()
        try:
            transaction.rollback()
        except sa.exc.ResourceClosedError:
            pass
        except sa.exc.InvalidRequestError:
            pass
        connection.close()

