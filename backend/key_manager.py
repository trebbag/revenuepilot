import os
import stat
from typing import Optional

try:
    import keyring
    from keyring.errors import KeyringError
except Exception:  # pragma: no cover - keyring may not be installed
    keyring = None

    class KeyringError(Exception):
        """Fallback error when keyring is unavailable."""
        pass

from platformdirs import user_data_dir

APP_NAME = "RevenuePilot"
SERVICE_NAME = "revenuepilot-openai"


def _file_path() -> str:
    """Return OS-specific path for storing the API key."""
    directory = user_data_dir(APP_NAME, APP_NAME)
    os.makedirs(directory, exist_ok=True)
    return os.path.join(directory, "openai_key.txt")


def get_api_key() -> Optional[str]:
    """Load the OpenAI API key from env, keyring, or file."""
    key = os.getenv("OPENAI_API_KEY")
    if key:
        return key
    if keyring:
        try:
            key = keyring.get_password(SERVICE_NAME, "api_key")
        except KeyringError:
            key = None
        if key:
            os.environ["OPENAI_API_KEY"] = key
            return key
    path = _file_path()
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                key = f.read().strip()
            if key:
                os.environ["OPENAI_API_KEY"] = key
                return key
        except OSError:
            pass
    return None


def save_api_key(key: str) -> None:
    """Persist the API key to keyring or file with restricted permissions."""
    if keyring:
        try:
            keyring.set_password(SERVICE_NAME, "api_key", key)
            os.environ["OPENAI_API_KEY"] = key
            return
        except KeyringError:
            # fall back to file storage
            pass
    path = _file_path()
    with open(path, "w", encoding="utf-8") as f:
        f.write(key)
    try:
        if os.name == "nt":
            os.chmod(path, stat.S_IREAD | stat.S_IWRITE)
        else:
            os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)
    except OSError:
        # Best effort; ignore if permissions cannot be set
        pass
    os.environ["OPENAI_API_KEY"] = key
