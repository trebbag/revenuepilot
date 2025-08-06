import requests
from backend import public_health


class DummyResp:
    def __init__(self, data):
        self._data = data

    def raise_for_status(self):
        pass

    def json(self):
        return self._data


def test_fetch_vaccination_recommendations(monkeypatch):
    def fake_get(url, params=None, timeout=10):
        assert url == public_health.VACCINATION_API_URL
        assert params == {"age": 40, "sex": "male", "region": "US"}
        return DummyResp({"vaccinations": ["Flu shot"]})

    monkeypatch.setattr(public_health.requests, "get", fake_get)
    result = public_health.fetch_vaccination_recommendations(40, "male", "US")
    assert result == ["Flu shot"]


def test_fetch_screening_recommendations(monkeypatch):
    def fake_get(url, params=None, timeout=10):
        assert url == public_health.SCREENING_API_URL
        assert params == {"age": 40, "sex": "male", "region": "US"}
        return DummyResp({"screenings": ["BP check"]})

    monkeypatch.setattr(public_health.requests, "get", fake_get)
    result = public_health.fetch_screening_recommendations(40, "male", "US")
    assert result == ["BP check"]


def test_get_public_health_suggestions_combines(monkeypatch):
    monkeypatch.setattr(
        public_health,
        "fetch_vaccination_recommendations",
        lambda *args, **kwargs: ["Flu shot"],
    )
    monkeypatch.setattr(
        public_health,
        "fetch_screening_recommendations",
        lambda *args, **kwargs: ["Flu shot", "BP check"],
    )
    result = public_health.get_public_health_suggestions(40, "male", "US")
    assert result == ["Flu shot", "BP check"]


def test_fetch_vaccination_recommendations_error(monkeypatch):
    def fake_get(*args, **kwargs):
        raise requests.RequestException("boom")

    monkeypatch.setattr(public_health.requests, "get", fake_get)
    result = public_health.fetch_vaccination_recommendations(40, "male", "US")
    assert result == []

