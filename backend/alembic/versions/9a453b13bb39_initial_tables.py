"""initial tables

Revision ID: 9a453b13bb39
Revises:
Create Date: 2025-02-27

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9a453b13bb39'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'awards',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('award_id', sa.String(), nullable=True),
        sa.Column('award_fixed_id', sa.String(), nullable=True),
        sa.Column('award_code', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('version_number', sa.String(), nullable=True),
        sa.Column('award_operative_from', sa.Date(), nullable=True),
        sa.Column('award_operative_to', sa.Date(), nullable=True),
        sa.Column('last_modified_datetime', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('award_id')
    )
    op.create_index(op.f('ix_awards_award_code'), 'awards', ['award_code'], unique=False)
    op.create_index(op.f('ix_awards_award_id'), 'awards', ['award_id'], unique=True)

    op.create_table(
        'classifications',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('award_code', sa.String(), nullable=False),
        sa.Column('employee_rate_type_code', sa.String(), nullable=False),
        sa.Column('classification', sa.String(), nullable=False),
        sa.Column('classification_level', sa.Integer(), nullable=False),
        sa.Column('base_rate', sa.Float(), nullable=True),
        sa.Column('base_rate_type', sa.String(), nullable=True),
        sa.Column('calculated_rate', sa.Float(), nullable=True),
        sa.Column('calculated_rate_type', sa.String(), nullable=True),
        sa.Column('operative_from', sa.Date(), nullable=True),
        sa.Column('operative_to', sa.Date(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_classifications_award_code'), 'classifications', ['award_code'], unique=False)

    op.create_table(
        'wage_allowances',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('award_code', sa.String(), nullable=False),
        sa.Column('allowance', sa.String(), nullable=True),
        sa.Column('type', sa.String(), nullable=True),
        sa.Column('rate', sa.Float(), nullable=True),
        sa.Column('base_rate', sa.Float(), nullable=True),
        sa.Column('rate_unit', sa.String(), nullable=True),
        sa.Column('allowance_amount', sa.Float(), nullable=True),
        sa.Column('payment_frequency', sa.String(), nullable=True),
        sa.Column('operative_from', sa.Date(), nullable=True),
        sa.Column('operative_to', sa.Date(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_wage_allowances_award_code'), 'wage_allowances', ['award_code'], unique=False)

    op.create_table(
        'expense_allowances',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('award_code', sa.String(), nullable=False),
        sa.Column('allowance', sa.String(), nullable=True),
        sa.Column('allowance_amount', sa.Float(), nullable=True),
        sa.Column('payment_frequency', sa.String(), nullable=True),
        sa.Column('operative_from', sa.Date(), nullable=True),
        sa.Column('operative_to', sa.Date(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_expense_allowances_award_code'), 'expense_allowances', ['award_code'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_expense_allowances_award_code'), table_name='expense_allowances')
    op.drop_table('expense_allowances')
    op.drop_index(op.f('ix_wage_allowances_award_code'), table_name='wage_allowances')
    op.drop_table('wage_allowances')
    op.drop_index(op.f('ix_classifications_award_code'), table_name='classifications')
    op.drop_table('classifications')
    op.drop_index(op.f('ix_awards_award_id'), table_name='awards')
    op.drop_index(op.f('ix_awards_award_code'), table_name='awards')
    op.drop_table('awards')
