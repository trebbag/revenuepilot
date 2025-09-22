from pathlib import Path

from alembic import command
from alembic.config import Config


def test_alembic_heads_match_metadata(tmp_path):
    repo_root = Path(__file__).resolve().parents[1]
    cfg = Config(str(repo_root / 'backend' / 'alembic' / 'alembic.ini'))
    cfg.set_main_option('script_location', str(repo_root / 'backend' / 'alembic'))
    db_path = tmp_path / 'alembic-check.db'
    cfg.set_main_option('sqlalchemy.url', f'sqlite+pysqlite:///{db_path}')

    command.upgrade(cfg, 'head')
    command.check(cfg)
