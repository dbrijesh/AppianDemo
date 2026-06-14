"""initial audit schema

Revision ID: 001
Revises:
Create Date: 2024-01-01 00:00:00
"""
from alembic import op
import sqlalchemy as sa

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "audit_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("entity_type", sa.String(128), nullable=False, index=True),
        sa.Column("entity_id", sa.String(256), nullable=False, index=True),
        sa.Column("action", sa.String(128), nullable=False),
        sa.Column("actor_id", sa.String(256), nullable=False),
        sa.Column("actor_email", sa.String(256), nullable=False),
        sa.Column("payload", sa.Text, nullable=False),
        sa.Column("workflow_instance_id", sa.String(36), nullable=True, index=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("previous_hash", sa.String(64), nullable=True),
        sa.Column("event_hash", sa.String(64), nullable=False),
    )


def downgrade():
    op.drop_table("audit_events")
