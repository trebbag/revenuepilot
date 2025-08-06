import requests
from backend import public_health


class DummyResp:
    def __init__(self, data):
        self._data = data

    def raise_for_status(self):
        pass

    def json(self):
        return self._data


def test_get_public_health_suggestions(monkeypatch):
    def fake_get(url, params=None, timeout=10):
        assert params == {"age": 40, "sex": "male", "region": "US"}
        return DummyResp({"suggestions": ["Flu shot", "BP check"]})

    monkeypatch.setattr(public_health.requests, "get", fake_get)
    result = public_health.get_public_health_suggestions(40, "male", "US")
    assert result == ["Flu shot", "BP check"]


def test_get_public_health_suggestions_error(monkeypatch):
    def fake_get(*args, **kwargs):
        raise requests.RequestException("boom")

    monkeypatch.setattr(public_health.requests, "get", fake_get)
    result = public_health.get_public_health_suggestions(40, "male", "US")
    assert result == []
