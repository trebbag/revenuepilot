import backend.scheduling as scheduling

def test_recommend_follow_up_llm(monkeypatch):
    def fake_call_openai(messages):
        return "Patient should return in 3 months for follow-up."
    monkeypatch.setattr(scheduling, "call_openai", fake_call_openai)
    note = "Routine visit"
    codes = ["Z00.00"]
    assert scheduling.recommend_follow_up(note, codes) == "3 months"

def test_recommend_follow_up_fallback(monkeypatch):
    def boom(messages):
        raise RuntimeError("boom")
    monkeypatch.setattr(scheduling, "call_openai", boom)
    note = "Patient with chronic diabetes under control"
    codes = ["E11.9"]
    assert scheduling.recommend_follow_up(note, codes) == "3 months"

def test_export_ics():
    ics = scheduling.export_ics("2 weeks")
    assert "BEGIN:VCALENDAR" in ics
    assert "DTSTART" in ics
