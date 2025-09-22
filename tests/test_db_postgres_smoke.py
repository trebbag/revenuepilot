import sqlalchemy as sa

import pytest

from backend.db import models as db_models


@pytest.mark.postgres
def test_postgres_crud_smoke(orm_session):
    clinic = db_models.Clinic(id='clinic-1', code='CL1', name='Clinic One')
    orm_session.add(clinic)

    user = db_models.User(
        username='pg-user',
        email='pg-user@example.test',
        password_hash='$2b$12$abcdefghijklmnopqrstuv',
        role='admin',
        clinic_id=clinic.id,
        name='PG User',
    )
    orm_session.add(user)
    orm_session.flush()

    fetched_user = orm_session.execute(
        sa.select(db_models.User).where(db_models.User.username == 'pg-user')
    ).scalar_one()
    assert fetched_user.created_at.tzinfo is not None
    fetched_user.name = 'Updated User'
    orm_session.flush()
    refreshed_user = orm_session.get(db_models.User, fetched_user.id)
    assert refreshed_user.name == 'Updated User'

    issue = db_models.ComplianceIssue(
        issue_id='issue-1',
        title='Missing documentation',
        severity=db_models.ComplianceSeverity.HIGH,
        status=db_models.ComplianceStatus.OPEN,
        category='testing',
    )
    orm_session.add(issue)

    notification = db_models.Notification(username='pg-user', count=3)
    orm_session.add(notification)
    orm_session.flush()

    fetched_issue = orm_session.execute(
        sa.select(db_models.ComplianceIssue).where(db_models.ComplianceIssue.issue_id == 'issue-1')
    ).scalar_one()
    assert fetched_issue.created_at.tzinfo is not None
    fetched_issue.status = db_models.ComplianceStatus.RESOLVED

    orm_session.delete(notification)
    orm_session.flush()

    remaining_notifications = orm_session.execute(
        sa.select(sa.func.count()).select_from(db_models.Notification)
    ).scalar_one()
    assert remaining_notifications == 0
