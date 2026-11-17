"""applicant profile fields

Revision ID: 0001_applicant_profile_fields
Revises:
Create Date: 2026-11-17 21:30:00.000000

"""
from alembic import context, op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0001_applicant_profile_fields"
down_revision = None
branch_labels = None
depends_on = None

FK_NAME = "fk_users_profile_image_id_media_assets"
INDEX_NAME = "ix_users_profile_image_id"


def _is_sqlite():
    return context.get_context().connection.dialect.name == "sqlite"


def upgrade():
    op.add_column("users", sa.Column("date_of_birth", sa.Date(), nullable=True))
    op.add_column("users", sa.Column("profile_image_id", sa.String(length=36), nullable=True))
    op.add_column("users", sa.Column("is_group", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("users", sa.Column("group_name", sa.String(length=150), nullable=True))
    op.add_column("users", sa.Column("group_member_count", sa.Integer(), nullable=True))
    op.create_index(INDEX_NAME, "users", ["profile_image_id"], unique=False)
    # SQLite does not support adding constraints to existing tables; the FK is
    # created natively by `db.create_all()` on fresh/local databases. PostgreSQL
    # (production) supports ALTER TABLE ... ADD CONSTRAINT.
    if not _is_sqlite():
        op.create_foreign_key(
            FK_NAME,
            "users",
            "media_assets",
            ["profile_image_id"],
            ["id"],
            ondelete="SET NULL",
        )

    op.add_column("applications", sa.Column("genre", sa.String(length=100), nullable=True))


def downgrade():
    op.drop_column("applications", "genre")

    if not _is_sqlite():
        op.drop_constraint(FK_NAME, "users", type_="foreignkey")
    op.drop_index(INDEX_NAME, table_name="users")
    op.drop_column("users", "group_member_count")
    op.drop_column("users", "group_name")
    op.drop_column("users", "is_group")
    op.drop_column("users", "profile_image_id")
    op.drop_column("users", "date_of_birth")
