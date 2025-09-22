import sqlalchemy as sa

from backend.db import models as db_models


def test_all_datetime_columns_are_timezone_aware():
    tz_columns = []
    for table in db_models.Base.metadata.sorted_tables:
        for column in table.columns:
            if isinstance(column.type, sa.DateTime):
                tz_columns.append((table.name, column.name))
                assert (
                    getattr(column.type, 'timezone', False)
                ), f"{table.name}.{column.name} must be timezone-aware"
    assert tz_columns, "Expected at least one timezone-aware column in metadata"
