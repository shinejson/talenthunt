"""Guest applications, private audition media, and nomination email tracking."""
from alembic import op
import sqlalchemy as sa

revision = "0002_guest_applications"
down_revision = "0001_applicant_profile_fields"
branch_labels = None
depends_on = None

ENTRY_INDEX = "uq_applications_guest_entry"
ENTRY_FILTER = sa.text("applicant_full_name IS NOT NULL AND status <> 'WITHDRAWN'")


def _add_columns(table_name, new_columns, nullable_column=None):
    columns = {c["name"]: c for c in sa.inspect(op.get_bind()).get_columns(table_name)}
    with op.batch_alter_table(table_name) as batch:
        if nullable_column and not columns[nullable_column]["nullable"]:
            batch.alter_column(nullable_column, existing_type=sa.String(36), nullable=True)
        for column in new_columns:
            if column.name not in columns:
                batch.add_column(column)


def upgrade():
    # db.create_all() is also used for fresh installs, which may already have these columns.
    _add_columns("media_assets", [
        sa.Column("is_private", sa.Boolean(), nullable=False, server_default=sa.false()),
    ], "owner_user_id")
    _add_columns("applications", [
        sa.Column("applicant_full_name", sa.String(150)),
        sa.Column("date_of_birth", sa.Date()),
        sa.Column("is_group", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("group_name", sa.String(150)),
        sa.Column("group_member_count", sa.Integer()),
        sa.Column("profile_image_id", sa.String(36), sa.ForeignKey("media_assets.id", ondelete="SET NULL", name="fk_applications_profile_image")),
        sa.Column("nomination_email_sent_at", sa.DateTime()),
    ], "user_id")
    _add_columns("submissions", [
        sa.Column("second_media_asset_id", sa.String(36), sa.ForeignKey("media_assets.id", ondelete="SET NULL", name="fk_submissions_second_media")),
    ])
    if ENTRY_INDEX not in {i["name"] for i in sa.inspect(op.get_bind()).get_indexes("applications")}:
        op.create_index(
            ENTRY_INDEX, "applications", ["competition_id", "category_id", "contact_email"], unique=True,
            sqlite_where=ENTRY_FILTER, postgresql_where=ENTRY_FILTER,
        )


def downgrade():
    connection = op.get_bind()
    if connection.execute(sa.text("SELECT 1 FROM applications WHERE applicant_full_name IS NOT NULL LIMIT 1")).first():
        raise RuntimeError("Cannot downgrade while guest applications exist. Back up/export them before downgrading.")
    op.drop_index(ENTRY_INDEX, table_name="applications")
    with op.batch_alter_table("submissions") as batch:
        batch.drop_column("second_media_asset_id")
    with op.batch_alter_table("applications") as batch:
        batch.alter_column("user_id", existing_type=sa.String(36), nullable=False)
        for name in ("nomination_email_sent_at", "profile_image_id", "group_member_count", "group_name", "is_group", "date_of_birth", "applicant_full_name"):
            batch.drop_column(name)
    with op.batch_alter_table("media_assets") as batch:
        batch.alter_column("owner_user_id", existing_type=sa.String(36), nullable=False)
        batch.drop_column("is_private")
