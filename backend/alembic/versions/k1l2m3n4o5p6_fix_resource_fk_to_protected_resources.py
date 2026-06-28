"""Fix resource FK references to protected_resources

Revision ID: k1l2m3n4o5p6
Revises: j0k1l2m3n4o5
Create Date: 2026-05-27

"""
from __future__ import annotations

from alembic import op

revision = 'k1l2m3n4o5p6'
down_revision = 'j0k1l2m3n4o5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Already applied manually – stub only.
    pass


def downgrade() -> None:
    pass
