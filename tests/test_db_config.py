import pytest

from backend.db.config import get_database_settings


def test_engine_options_reflect_env(monkeypatch):
    monkeypatch.setenv('REVENUEPILOT_DATABASE_URL', 'postgresql+psycopg://user:pass@localhost/testdb')
    monkeypatch.setenv('DB_POOL_SIZE', '7')
    monkeypatch.setenv('DB_MAX_OVERFLOW', '2')
    monkeypatch.setenv('PGCONNECT_TIMEOUT', '15')
    monkeypatch.setenv('STATEMENT_TIMEOUT_MS', '45000')
    monkeypatch.delenv('DB_POOL_TIMEOUT', raising=False)

    get_database_settings.cache_clear()
    settings = get_database_settings()
    options = settings.engine_options()
    assert options['pool_size'] == 7
    assert options['max_overflow'] == 2
    connect_args = options['connect_args']
    assert connect_args['connect_timeout'] == 15
    assert '-c timezone=UTC' in connect_args['options']
    assert '-c statement_timeout=45000' in connect_args['options']

    monkeypatch.delenv('REVENUEPILOT_DATABASE_URL', raising=False)
    monkeypatch.delenv('DB_POOL_SIZE', raising=False)
    monkeypatch.delenv('DB_MAX_OVERFLOW', raising=False)
    monkeypatch.delenv('PGCONNECT_TIMEOUT', raising=False)
    monkeypatch.delenv('STATEMENT_TIMEOUT_MS', raising=False)
    get_database_settings.cache_clear()


def test_invalid_integer_env_raises(monkeypatch):
    monkeypatch.setenv('REVENUEPILOT_DATABASE_URL', 'postgresql+psycopg://user:pass@localhost/testdb')
    monkeypatch.setenv('DB_POOL_SIZE', 'not-a-number')
    get_database_settings.cache_clear()
    settings = get_database_settings()
    with pytest.raises(ValueError):
        settings.engine_options()
    monkeypatch.delenv('REVENUEPILOT_DATABASE_URL', raising=False)
    monkeypatch.delenv('DB_POOL_SIZE', raising=False)
    get_database_settings.cache_clear()
