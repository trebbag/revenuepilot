import types

import backend.guidelines as gl


def test_get_guidelines_caches_and_extracts(monkeypatch):
    calls = []

    def fake_download(url: str):
        calls.append(url)
        if url == gl.CDC_VACCINES_URL:
            return [{"text": "flu shot"}, "polio"]
        elif url == gl.USPSTF_SCREENINGS_URL:
            return [{"recommendation": "mammogram"}]
        return []

    monkeypatch.setattr(gl, "_download", fake_download)
    gl._guideline_cache.clear()

    result = gl.get_guidelines(30, "female", "US")
    assert result == {
        "vaccinations": ["flu shot", "polio"],
        "screenings": ["mammogram"],
    }
    assert calls == [gl.CDC_VACCINES_URL, gl.USPSTF_SCREENINGS_URL]

    # Second call should use cache and not call _download again
    cached = gl.get_guidelines(30, "female", "US")
    assert cached == result
    assert calls == [gl.CDC_VACCINES_URL, gl.USPSTF_SCREENINGS_URL]
