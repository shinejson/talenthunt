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
    # Older deployments created schema from the models without an Alembic revision.
    inspector = sa.inspect(op.get_bind())
    user_columns = {c["name"] for c in inspector.get_columns("users")}
    for column in (
        sa.Column("date_of_birth", sa.Date(), nullable=True),
        sa.Column("profile_image_id", sa.String(length=36), nullable=True),
        sa.Column("is_group", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("group_name", sa.String(length=150), nullable=True),
        sa.Column("group_member_count", sa.Integer(), nullable=True),
    ):
        if column.name not in user_columns:
            op.add_column("users", column)
    if INDEX_NAME not in {i["name"] for i in inspector.get_indexes("users")}:
        op.create_index(INDEX_NAME, "users", ["profile_image_id"], unique=False)
    if not _is_sqlite() and not any(fk["constrained_columns"] == ["profile_image_id"] for fk in inspector.get_foreign_keys("users")):
        op.create_foreign_key(FK_NAME, "users", "media_assets", ["profile_image_id"], ["id"], ondelete="SET NULL")
    if "genre" not in {c["name"] for c in inspector.get_columns("applications")}:
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
