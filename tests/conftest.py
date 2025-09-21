import os
import sys
from datetime import datetime, timezone

# Ensure the repository root is on sys.path so tests can import the backend package
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

_now_iso = datetime.now(timezone.utc).isoformat()
os.environ.setdefault('ENVIRONMENT', 'development')
os.environ.setdefault('JWT_SECRET', 'test-jwt-secret')
os.environ.setdefault('JWT_SECRET_ROTATED_AT', _now_iso)
os.environ.setdefault('OPENAI_API_KEY', 'sk-test-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
os.environ.setdefault('OPENAI_API_KEY_ROTATED_AT', _now_iso)
