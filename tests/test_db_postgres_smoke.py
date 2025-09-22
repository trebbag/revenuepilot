import sqlalchemy as sa

import pytest

from backend.db import models


@pytest.mark.postgres
def test_postgres_crud_smoke(orm_session):
    clinic = models.Clinic(id='clinic-1', code='CL1', name='Clinic One')
    orm_session.add(clinic)

    user = models.User(
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
        sa.select(models.User).where(models.User.username == 'pg-user')
    ).scalar_one()
    assert fetched_user.created_at.tzinfo is not None
    fetched_user.name = 'Updated User'
    orm_session.flush()
    refreshed_user = orm_session.get(models.User, fetched_user.id)
    assert refreshed_user.name == 'Updated User'

    issue = models.ComplianceIssue(
        issue_id='issue-1',
        title='Missing documentation',
        severity=models.ComplianceSeverity.HIGH,
        status=models.ComplianceStatus.OPEN,
        category='testing',
    )
    orm_session.add(issue)

    notification = models.Notification(username='pg-user', count=3)
    orm_session.add(notification)
    orm_session.flush()

    fetched_issue = orm_session.execute(
        sa.select(models.ComplianceIssue).where(models.ComplianceIssue.issue_id == 'issue-1')
    ).scalar_one()
    assert fetched_issue.created_at.tzinfo is not None
    fetched_issue.status = models.ComplianceStatus.RESOLVED

    orm_session.delete(notification)
    orm_session.flush()

    remaining_notifications = orm_session.execute(
        sa.select(sa.func.count()).select_from(models.Notification)
    ).scalar_one()
    assert remaining_notifications == 0
