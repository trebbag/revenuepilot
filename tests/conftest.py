import asyncio
import inspect
import os
import sqlite3
import sys
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterator

import pytest
import sqlalchemy as sa
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

# Ensure the repository root is on sys.path so tests can import the backend package
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

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
    assert isinstance(raw_connection, sqlite3.Connection)
    raw_connection.row_factory = sqlite3.Row

    previous = getattr(main, 'db_conn', None)
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
    main.app.dependency_overrides[main.get_db] = lambda: raw_connection

    session_factory = sessionmaker(
        bind=engine,
        autoflush=False,
        expire_on_commit=False,
        future=True,
    )

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
        main.app.dependency_overrides.pop(main.get_db, None)
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

