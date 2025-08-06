import backend.scheduling as scheduling

def test_recommend_follow_up_chronic():
    note = "Patient with chronic diabetes under control"
    codes = ["E11.9"]
    assert scheduling.recommend_follow_up(note, codes) == "3 months"

def test_recommend_follow_up_acute():
    note = "Patient sprained ankle yesterday"
    codes = ["S93.4"]
    assert scheduling.recommend_follow_up(note, codes) == "2 weeks"

def test_recommend_follow_up_none():
    note = "Routine physical exam"
    codes = ["Z00.00"]
    assert scheduling.recommend_follow_up(note, codes) is None
