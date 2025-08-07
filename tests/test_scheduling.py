import backend.scheduling as scheduling


def test_has_prefix_helper():
    """_has_prefix returns True when any code matches a prefix."""
    assert scheduling._has_prefix(["E11.9", "I10"], ["E11"]) is True
    assert scheduling._has_prefix(["I10"], ["E11"]) is False


def test_chronic_code_interval():
    res = scheduling.recommend_follow_up(["E11.9"], [])
    assert res["interval"] == "3 months"
    assert "BEGIN:VCALENDAR" in res["ics"]


def test_acute_code_interval():
    res = scheduling.recommend_follow_up(["S93.401A"], [])
    assert res["interval"] == "2 weeks"


def test_export_ics():
    ics = scheduling.export_ics("2 weeks", summary="Visit")
    assert "BEGIN:VCALENDAR" in ics
    assert "DTSTART" in ics and "DTEND" in ics
    assert "SUMMARY:Visit" in ics


def test_custom_interval_override():
    res = scheduling.recommend_follow_up(["E11.9"], [], code_intervals={"E11": "6 months"})
    assert res["interval"] == "6 months"
    assert "BEGIN:VCALENDAR" in res["ics"]


def test_clinician_override_interval():
    text = "Patient should follow up in 10 days for evaluation."
    res = scheduling.recommend_follow_up([], [text])
    assert res["interval"] == "10 days"


def test_specialty_payer_overrides():
    res = scheduling.recommend_follow_up(["E11.9"], [], specialty="cardiology")
    assert res["interval"] == "1 month"
    assert "specialty" in res["reason"]
    res2 = scheduling.recommend_follow_up(
        ["E11.9"], [], specialty="cardiology", payer="medicare"
    )
    assert res2["interval"] == "6 weeks"
    assert "payer" in res2["reason"]

