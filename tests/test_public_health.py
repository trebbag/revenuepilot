import pytest
from backend import public_health


@pytest.fixture(autouse=True)
def _clear_cache():
    public_health.clear_cache()


def test_fetch_vaccination_recommendations(monkeypatch):
    def fake_guidelines(age, sex, region):
        assert age == 40
        assert sex == "male"
        assert region == "US"
        return {"vaccinations": [{"recommendation": "Flu shot", "region": "US"}]}

    monkeypatch.setattr(public_health, "get_guidelines", fake_guidelines)
    result = public_health.fetch_vaccination_recommendations(40, "male", "US")
    assert result == ["Flu shot"]


def test_fetch_screening_recommendations(monkeypatch):
    def fake_guidelines(age, sex, region):
        assert age == 40
        assert sex == "male"
        assert region == "US"
        return {"screenings": [{"recommendation": "BP check", "region": "US"}]}

    monkeypatch.setattr(public_health, "get_guidelines", fake_guidelines)
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
    def fake_guidelines(*args, **kwargs):
        raise Exception("boom")

    monkeypatch.setattr(public_health, "get_guidelines", fake_guidelines)
    result = public_health.fetch_vaccination_recommendations(40, "male", "US")
    assert result == []


def test_caching_avoids_repeated_calls(monkeypatch):
    calls = []

    def fake_guidelines(age, sex, region):
        calls.append((age, sex, region))
        return {
            "vaccinations": ["Flu shot"],
            "screenings": ["BP check"],
        }

    public_health.clear_cache()
    monkeypatch.setattr(public_health, "get_guidelines", fake_guidelines)

    first = public_health.get_public_health_suggestions(40, "male", "US")
    second = public_health.get_public_health_suggestions(40, "male", "US")
    assert first == ["Flu shot", "BP check"]
    assert second == ["Flu shot", "BP check"]
    # get_guidelines should only be called twice (once per category)
    assert len(calls) == 2


def test_region_filtering(monkeypatch):
    def fake_guidelines(age, sex, region):
        return {
            "vaccinations": [
                {"recommendation": "US only", "region": "US"},
                {"recommendation": "CA only", "region": "CA"},
            ]
        }

    monkeypatch.setattr(public_health, "get_guidelines", fake_guidelines)
    result = public_health.fetch_vaccination_recommendations(40, "male", "US")
    assert result == ["US only"]

