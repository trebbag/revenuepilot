import asyncio
import inspect
import os
import sys
from datetime import datetime, timezone

import pytest

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

