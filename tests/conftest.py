import asyncio
import inspect
import os
import sys

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
