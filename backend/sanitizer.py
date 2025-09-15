import bleach

def sanitize_text(value: str) -> str:
    """Return a sanitized version of *value* with HTML stripped.

    This removes any HTML tags to mitigate XSS attacks.
    """
    return bleach.clean(value, tags=[], attributes={}, strip=True)
