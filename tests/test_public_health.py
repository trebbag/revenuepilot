import json
import pytest

from backend import public_health


@pytest.fixture(autouse=True)
def _clear_cache():
    public_health.clear_cache()


def test_get_public_health_suggestions_includes_source(monkeypatch):
    def fake_cdc(age, sex, region):
        return [
            {
                "recommendation": "Flu shot",
                "source": "CDC",
                "evidenceLevel": "A",
            }
        ]

    def fake_who(age, sex, region):
        return [
            {
                "recommendation": "BP check",
                "source": "WHO",
                "evidenceLevel": "B",
            }
        ]

    monkeypatch.setattr(
        public_health,
        "_AGENCY_FETCHERS",
        {"cdc": fake_cdc, "who": fake_who},
    )
    res = public_health.get_public_health_suggestions(40, "male", "US")
    assert {"recommendation": "Flu shot", "source": "CDC", "evidenceLevel": "A"} in res
    assert {"recommendation": "BP check", "source": "WHO", "evidenceLevel": "B"} in res


def test_guideline_cache(monkeypatch):
    calls = {"cdc": 0}

    def fake_cdc(age, sex, region):
        calls["cdc"] += 1
        return [
            {
                "recommendation": "Flu shot",
                "source": "CDC",
                "evidenceLevel": "A",
            }
        ]

    monkeypatch.setattr(public_health, "_AGENCY_FETCHERS", {"cdc": fake_cdc})

    times = iter([0, 5, 15])
    monkeypatch.setattr(public_health, "_now", lambda: next(times))
    public_health.CACHE_TTL = 10

    public_health.get_public_health_suggestions(40, "male", "US", ["cdc"])
    public_health.get_public_health_suggestions(40, "male", "US", ["cdc"])
    public_health.get_public_health_suggestions(40, "male", "US", ["cdc"])
    assert calls["cdc"] == 2

