import sqlite3

import pytest

from backend import code_tables, main, migrations


@pytest.fixture
def db(monkeypatch):
    conn = sqlite3.connect(":memory:", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    main._init_core_tables(conn)
    monkeypatch.setattr(main, "db_conn", conn)
    yield conn
    conn.close()


def test_validate_cpt_reads_database(db):
    with migrations.session_scope(db) as session:
        migrations.seed_cpt_codes(
            session,
            [
                (
                    "97777",
                    {
                        "description": "Remote physiologic monitoring, complex",
                        "rvu": 2.75,
                        "reimbursement": 180.0,
                        "documentation": {"required": ["device data review"], "recommended": ["patient contact"], "examples": []},
                        "icd10_prefixes": ["Z99"],
                        "demographics": {"minAge": 18, "allowedGenders": ["any"]},
                        "encounterTypes": ["telehealth"],
                        "specialties": ["family medicine"],
                    },
                )
            ],
            overwrite=True,
        )
        migrations.seed_icd10_codes(
            session,
            [
                (
                    "Z99.10",
                    {
                        "description": "Dependence on respirator",
                        "clinicalContext": "Home ventilator check",
                        "contraindications": [],
                        "documentation": {"required": ["ventilator settings recorded"]},
                        "demographics": {"minAge": 18, "allowedGenders": ["any"]},
                        "encounterTypes": ["telehealth"],
                        "specialties": ["family medicine"],
                    },
                )
            ],
            overwrite=True,
        )
        migrations.seed_hcpcs_codes(
            session,
            [
                (
                    "G9001",
                    {
                        "description": "Coordinated care fee, initial",
                        "rvu": 0.5,
                        "reimbursement": 45.0,
                        "coverage": {"status": "covered", "notes": "Requires care plan."},
                        "documentation": {"required": ["care plan"], "recommended": ["follow-up notes"]},
                        "demographics": {"allowedGenders": ["any"]},
                        "encounterTypes": ["telehealth"],
                        "specialties": ["care coordination"],
                    },
                )
            ],
            overwrite=True,
        )

    result = code_tables.validate_cpt("97777", age=32, gender="female", encounter_type="telehealth", specialty="family medicine", session=db)
    assert result["valid"] is True
    assert result["description"] == "Remote physiologic monitoring, complex"
    assert result["requirements"] == ["device data review"]

    documentation = code_tables.get_documentation("97777", session=db)
    assert documentation["required"] == ["device data review"]

    combination = code_tables.validate_combination(["97777"], ["Z99.10"], age=30, gender="female", encounter_type="telehealth", specialty="family medicine", session=db)
    assert combination["validCombinations"] is True
    assert combination["contextIssues"] == []

    hcpcs = code_tables.validate_hcpcs("G9001", age=40, gender="male", encounter_type="telehealth", specialty="care coordination", session=db)
    assert hcpcs["valid"] is True
    assert hcpcs["coverage"]["status"].lower() == "covered"


def test_calculate_billing_uses_payer_override(db):
    with migrations.session_scope(db) as session:
        migrations.seed_cpt_codes(
            session,
            [
                (
                    "97778",
                    {
                        "description": "Remote monitoring treatment",
                        "rvu": 1.5,
                        "reimbursement": 90.0,
                        "documentation": {"required": ["treatment log"]},
                        "icd10_prefixes": ["Z99"],
                        "demographics": {"minAge": 18, "allowedGenders": ["any"]},
                    },
                )
            ],
            overwrite=True,
        )
        migrations.seed_cpt_reference(
            session,
            [("97778", {"description": "Remote monitoring treatment", "rvu": 1.5, "reimbursement": 90.0})],
            overwrite=True,
        )
        migrations.seed_payer_schedules(
            session,
            [
                {"payer_type": "medicare", "location": "", "code": "97778", "reimbursement": 120.0, "rvu": 1.6},
                {"payer_type": "medicare", "location": "nw", "code": "97778", "reimbursement": 150.0, "rvu": 1.8},
            ],
            overwrite=True,
        )

    billing = code_tables.calculate_billing(["97778"], payer_type="medicare", location="NW", session=db)
    assert billing["totalEstimated"] == pytest.approx(150.0)
    assert billing["totalRvu"] == pytest.approx(1.8)
    assert billing["breakdown"]["97778"]["amount"] == pytest.approx(150.0)
    assert billing["payerSpecific"]["payerType"].lower() == "medicare"
