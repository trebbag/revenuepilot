import json
import pytest

from backend import public_health


@pytest.fixture(autouse=True)
def _clear_cache():
    public_health.clear_cache()


def test_fetch_cdc_parsing(monkeypatch):
    sample = {"recommendations": [{"text": "Flu shot", "grade": "A"}]}
    monkeypatch.setattr(public_health, "_download_json", lambda url: sample)
    res = public_health._fetch_cdc(30, "female", "US")
    assert res == [
        {"recommendation": "Flu shot", "source": "CDC", "evidenceLevel": "A"}
    ]


def test_fetch_who_parsing(monkeypatch):
    sample = {"value": [{"title": "BP check", "evidenceLevel": "B"}]}
    monkeypatch.setattr(public_health, "_download_json", lambda url: sample)
    res = public_health._fetch_who(50, "male", "US")
    assert res == [
        {"recommendation": "BP check", "source": "WHO", "evidenceLevel": "B"}
    ]


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


def test_cache_is_region_specific(monkeypatch):
    calls = []

    def fake_cdc(age, sex, region):
        calls.append(region)
        return [
            {
                "recommendation": region,
                "source": "CDC",
                "evidenceLevel": "A",
            }
        ]

    monkeypatch.setattr(public_health, "_AGENCY_FETCHERS", {"cdc": fake_cdc})
    times = iter([0, 1, 2])
    monkeypatch.setattr(public_health, "_now", lambda: next(times))
    monkeypatch.setattr(public_health, "CACHE_TTL", 10)

    public_health.get_public_health_suggestions(40, "male", "US", ["cdc"])
    public_health.get_public_health_suggestions(40, "male", "EU", ["cdc"])
    public_health.get_public_health_suggestions(40, "male", "US", ["cdc"])
    assert calls == ["US", "EU"]


def test_region_specific_endpoints(monkeypatch):
    urls = []

    def fake_download(url):
        urls.append(url)
        return {"recommendations": [{"text": "x"}]}

    monkeypatch.setattr(public_health, "_download_json", fake_download)
    monkeypatch.setattr(
        public_health,
        "CDC_URL",
        "US:https://us.example/cdc;EU:https://eu.example/cdc",
    )
    monkeypatch.setattr(public_health, "_AGENCY_FETCHERS", {"cdc": public_health._fetch_cdc})
    monkeypatch.setattr(public_health, "CACHE_TTL", 100)

    public_health.get_public_health_suggestions(40, "male", "US", ["cdc"])
    public_health.get_public_health_suggestions(40, "male", "EU", ["cdc"])
    public_health.get_public_health_suggestions(40, "male", "US", ["cdc"])
    assert urls == ["https://us.example/cdc", "https://eu.example/cdc"]


def test_resolve_region_url():
    mapping = json.dumps({"US": "https://us", "EU": "https://eu"})
    assert public_health._resolve_region_url(mapping, "us") == "https://us"
    pairs = "US:https://us;EU:https://eu"
    assert public_health._resolve_region_url(pairs, "EU") == "https://eu"
    assert public_health._resolve_region_url(pairs, "AS") == pairs

