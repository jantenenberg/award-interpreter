"""Initial schema: trading_parameters, trades, market_data, daily_statistics.

Revision ID: 001
Revises:
Create Date: 2025-02-13

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _is_sqlite(connection):
    return connection.dialect.name == "sqlite"


def _uuid_col(connection):
    if _is_sqlite(connection):
        return sa.String(36), None
    return postgresql.UUID(as_uuid=True), sa.text("gen_random_uuid()")


def _json_col(connection):
    if _is_sqlite(connection):
        return sa.JSON()
    return postgresql.JSONB(astext_type=sa.Text())


def upgrade() -> None:
    connection = op.get_bind()
    sqlite = _is_sqlite(connection)
    uuid_type, uuid_default = _uuid_col(connection)
    json_type = _json_col(connection)

    # trading_parameters
    id_col = sa.Column("id", uuid_type, nullable=False)
    if uuid_default:
        id_col.server_default = uuid_default
    op.create_table(
        "trading_parameters",
        id_col,
        sa.Column("name", sa.String(100), unique=sqlite, nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("false"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.Column("max_position_size", sa.Numeric(10, 2), nullable=False),
        sa.Column("max_daily_loss", sa.Numeric(10, 2), nullable=False),
        sa.Column("max_concurrent_positions", sa.Integer(), nullable=False),
        sa.Column("risk_per_trade_pct", sa.Numeric(5, 2), nullable=False),
        sa.Column("profit_target_pips", sa.Numeric(5, 1), nullable=False),
        sa.Column("stop_loss_pips", sa.Numeric(5, 1), nullable=False),
        sa.Column("trailing_stop_enabled", sa.Boolean(), server_default=sa.text("false"), nullable=True),
        sa.Column("trailing_stop_activation_pips", sa.Numeric(5, 1), nullable=True),
        sa.Column("trailing_stop_distance_pips", sa.Numeric(5, 1), nullable=True),
        sa.Column("rsi_period", sa.Integer(), server_default=sa.text("14"), nullable=True),
        sa.Column("rsi_oversold", sa.Numeric(5, 2), server_default=sa.text("30"), nullable=True),
        sa.Column("rsi_overbought", sa.Numeric(5, 2), server_default=sa.text("70"), nullable=True),
        sa.Column("bb_period", sa.Integer(), server_default=sa.text("20"), nullable=True),
        sa.Column("bb_std_dev", sa.Numeric(3, 1), server_default=sa.text("2.0"), nullable=True),
        sa.Column("atr_period", sa.Integer(), server_default=sa.text("14"), nullable=True),
        sa.Column("enabled_pairs", json_type, nullable=False),
        sa.Column("trading_start_hour", sa.Integer(), server_default=sa.text("8"), nullable=True),
        sa.Column("trading_end_hour", sa.Integer(), server_default=sa.text("16"), nullable=True),
        sa.Column("max_trades_per_day", sa.Integer(), server_default=sa.text("15"), nullable=True),
        sa.Column("min_minutes_between_trades", sa.Integer(), server_default=sa.text("5"), nullable=True),
        sa.Column("max_spread_pips", sa.Numeric(4, 2), server_default=sa.text("2.5"), nullable=True),
        sa.Column("min_volatility_atr", sa.Numeric(5, 5), server_default=sa.text("0.0002"), nullable=True),
        sa.Column("max_volatility_atr", sa.Numeric(5, 5), server_default=sa.text("0.001"), nullable=True),
        sa.Column("strategy_type", sa.String(50), server_default=sa.text("'mean_reversion'"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_trading_parameters_active", "trading_parameters", ["is_active"], unique=False)
    if not sqlite:
        op.create_unique_constraint("trading_parameters_name_key", "trading_parameters", ["name"])

    # trades
    id_col_t = sa.Column("id", uuid_type, nullable=False)
    if uuid_default:
        id_col_t.server_default = uuid_default
    fk_col = sa.Column("parameter_set_id", uuid_type, nullable=True)
    op.create_table(
        "trades",
        id_col_t,
        sa.Column("trade_id", sa.String(50), unique=sqlite, nullable=False),
        fk_col,
        sa.Column("mode", sa.String(20), nullable=False),
        sa.Column("pair", sa.String(10), nullable=False),
        sa.Column("direction", sa.String(10), nullable=False),
        sa.Column("entry_price", sa.Numeric(10, 5), nullable=False),
        sa.Column("exit_price", sa.Numeric(10, 5), nullable=True),
        sa.Column("position_size", sa.Numeric(10, 2), nullable=False),
        sa.Column("entry_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("exit_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_minutes", sa.Integer(), nullable=True),
        sa.Column("profit_loss_pips", sa.Numeric(6, 2), nullable=True),
        sa.Column("profit_loss_usd", sa.Numeric(10, 2), nullable=True),
        sa.Column("spread_cost_pips", sa.Numeric(4, 2), nullable=True),
        sa.Column("slippage_pips", sa.Numeric(4, 2), nullable=True),
        sa.Column("stop_loss", sa.Numeric(10, 5), nullable=False),
        sa.Column("take_profit", sa.Numeric(10, 5), nullable=False),
        sa.Column("exit_reason", sa.String(50), nullable=True),
        sa.Column("entry_indicators", json_type, nullable=True),
        sa.Column("exit_indicators", json_type, nullable=True),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.ForeignKeyConstraint(["parameter_set_id"], ["trading_parameters.id"], ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_trades_entry_time", "trades", ["entry_time"], unique=False, postgresql_ops={"entry_time": "DESC"} if not sqlite else {})
    op.create_index("idx_trades_mode", "trades", ["mode"], unique=False)
    op.create_index("idx_trades_pair_status", "trades", ["pair", "status"], unique=False)
    if not sqlite:
        op.create_unique_constraint("trades_trade_id_key", "trades", ["trade_id"])

    # market_data
    op.create_table(
        "market_data",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("pair", sa.String(10), nullable=False),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("granularity", sa.String(10), nullable=False),
        sa.Column("open", sa.Numeric(10, 5), nullable=False),
        sa.Column("high", sa.Numeric(10, 5), nullable=False),
        sa.Column("low", sa.Numeric(10, 5), nullable=False),
        sa.Column("close", sa.Numeric(10, 5), nullable=False),
        sa.Column("volume", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("pair", "timestamp", "granularity", name="unique_candle"),
    )
    op.create_index("idx_market_data_pair_time", "market_data", ["pair", "timestamp"], unique=False, postgresql_ops={"timestamp": "DESC"} if not sqlite else {})

    # daily_statistics
    id_col_d = sa.Column("id", uuid_type, nullable=False)
    if uuid_default:
        id_col_d.server_default = uuid_default
    fk_col_d = sa.Column("parameter_set_id", uuid_type, nullable=True)
    op.create_table(
        "daily_statistics",
        id_col_d,
        sa.Column("date", sa.Date(), unique=sqlite, nullable=False),
        fk_col_d,
        sa.Column("total_trades", sa.Integer(), server_default=sa.text("0"), nullable=True),
        sa.Column("winning_trades", sa.Integer(), server_default=sa.text("0"), nullable=True),
        sa.Column("losing_trades", sa.Integer(), server_default=sa.text("0"), nullable=True),
        sa.Column("win_rate_pct", sa.Numeric(5, 2), nullable=True),
        sa.Column("total_profit_loss_usd", sa.Numeric(10, 2), nullable=True),
        sa.Column("total_profit_loss_pips", sa.Numeric(8, 2), nullable=True),
        sa.Column("largest_win_usd", sa.Numeric(10, 2), nullable=True),
        sa.Column("largest_loss_usd", sa.Numeric(10, 2), nullable=True),
        sa.Column("average_trade_duration_minutes", sa.Integer(), nullable=True),
        sa.Column("total_spread_cost_usd", sa.Numeric(10, 2), nullable=True),
        sa.Column("sharpe_ratio", sa.Numeric(6, 4), nullable=True),
        sa.Column("max_drawdown_usd", sa.Numeric(10, 2), nullable=True),
        sa.Column("max_drawdown_pct", sa.Numeric(5, 2), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.ForeignKeyConstraint(["parameter_set_id"], ["trading_parameters.id"], ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_daily_statistics_date", "daily_statistics", ["date"], unique=False, postgresql_ops={"date": "DESC"} if not sqlite else {})
    if not sqlite:
        op.create_unique_constraint("daily_statistics_date_key", "daily_statistics", ["date"])


def downgrade() -> None:
    op.drop_table("daily_statistics")
    op.drop_table("market_data")
    op.drop_table("trades")
    op.drop_table("trading_parameters")
