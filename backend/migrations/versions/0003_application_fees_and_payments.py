"""Application fees, payment verification codes, and bounced payment tracking."""
from alembic import op
import sqlalchemy as sa

revision = "0003_application_fees_and_payments"
down_revision = "0002_guest_applications"
branch_labels = None
depends_on = None


def _add_columns(table_name, new_columns):
    columns = {c["name"]: c for c in sa.inspect(op.get_bind()).get_columns(table_name)}
    with op.batch_alter_table(table_name) as batch:
        for column in new_columns:
            if column.name not in columns:
                batch.add_column(column)


def upgrade():
    _add_columns("competitions", [
        sa.Column("application_fee_minor", sa.Integer(), nullable=False, server_default="5000"),
    ])
    _add_columns("applications", [
        sa.Column("payment_code", sa.String(50), nullable=True),
        sa.Column("payment_reference", sa.String(100), nullable=True),
        sa.Column("payment_amount_minor", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("payment_status", sa.String(30), nullable=False, server_default="UNPAID"),
    ])

    bind = op.get_bind()
    tables = sa.inspect(bind).get_table_names()
    if "application_payments" not in tables:
        op.create_table(
            "application_payments",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("competition_id", sa.String(36), sa.ForeignKey("competitions.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("category_id", sa.String(36), sa.ForeignKey("categories.id", ondelete="SET NULL"), nullable=True),
            sa.Column("application_id", sa.String(36), sa.ForeignKey("applications.id", ondelete="SET NULL"), nullable=True, index=True),
            sa.Column("applicant_name", sa.String(150), nullable=True),
            sa.Column("applicant_email", sa.String(255), nullable=False, index=True),
            sa.Column("applicant_phone", sa.String(40), nullable=True),
            sa.Column("provider", sa.String(40), nullable=False, server_default="mock"),
            sa.Column("channel", sa.String(40), nullable=False, server_default="mobile_money"),
            sa.Column("network", sa.String(50), nullable=False, server_default="MTN Mobile Money"),
            sa.Column("payment_reference", sa.String(100), unique=True, nullable=False, index=True),
            sa.Column("payment_code", sa.String(50), unique=True, nullable=False, index=True),
            sa.Column("amount_minor", sa.Integer(), nullable=False, server_default="5000"),
            sa.Column("currency", sa.String(8), nullable=False, server_default="GHS"),
            sa.Column("status", sa.String(30), nullable=False, server_default="INITIALIZED", index=True),
            sa.Column("bounced_reason", sa.String(255), nullable=True),
            sa.Column("is_redeemed", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("paid_at", sa.DateTime(), nullable=True),
        )


def downgrade():
    op.drop_table("application_payments")
