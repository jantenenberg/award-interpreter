"""Seed script to create scalping parameter presets."""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.store.parameters import get_parameter_store


SCALPING_PRESETS = [
    {
        "name": "Conservative Scalper",
        "description": "Tight risk, London session only, EUR/USD only - 10 trades/day target",
        "max_position_size": 10000,
        "max_daily_loss": 150,
        "max_concurrent_positions": 1,
        "risk_per_trade_pct": 1.0,
        "profit_target_pips": 0,
        "stop_loss_pips": 4,
        "trailing_stop_enabled": True,
        "trailing_stop_activation_pips": 3,
        "trailing_stop_distance_pips": 2,
        "rsi_period": 9,
        "rsi_oversold": 30,
        "rsi_overbought": 70,
        "bb_period": 20,
        "bb_std_dev": 2.0,
        "atr_period": 14,
        "enabled_pairs": ["EUR/USD"],
        "trading_start_hour": 8,
        "trading_end_hour": 12,
        "max_trades_per_day": 10,
        "min_minutes_between_trades": 5,
        "max_spread_pips": 1.0,
        "min_volatility_atr": 0.0002,
        "max_volatility_atr": 0.001,
        "strategy_type": "scalping",
        "adx_period": 14,
        "max_adx_threshold": 30.0,
        "timeframe": "M5",
        "ema_fast_period": 5,
        "ema_slow_period": 13,
        "target_pips": 6.0,
        "stop_pips": 4.0,
        "breakeven_trigger_pips": 3.0,
        "trail_start_pips": 5.0,
        "trail_distance_pips": 2.0,
        "target_profit_per_trade": 50.0,
        "daily_profit_target": 300.0,
        "daily_loss_limit": 150.0,
        "max_trade_duration_minutes": 120.0,
    },
    {
        "name": "Aggressive Scalper",
        "description": "Higher frequency, multiple pairs, full session - 20 trades/day target",
        "max_position_size": 10000,
        "max_daily_loss": 250,
        "max_concurrent_positions": 2,
        "risk_per_trade_pct": 1.5,
        "profit_target_pips": 0,
        "stop_loss_pips": 5,
        "trailing_stop_enabled": True,
        "trailing_stop_activation_pips": 3,
        "trailing_stop_distance_pips": 2,
        "rsi_period": 9,
        "rsi_oversold": 30,
        "rsi_overbought": 70,
        "bb_period": 20,
        "bb_std_dev": 2.0,
        "atr_period": 14,
        "enabled_pairs": ["EUR/USD", "GBP/USD", "USD/JPY"],
        "trading_start_hour": 7,
        "trading_end_hour": 16,
        "max_trades_per_day": 20,
        "min_minutes_between_trades": 5,
        "max_spread_pips": 1.5,
        "min_volatility_atr": 0.0002,
        "max_volatility_atr": 0.001,
        "strategy_type": "scalping",
        "adx_period": 14,
        "max_adx_threshold": 30.0,
        "timeframe": "M5",
        "ema_fast_period": 5,
        "ema_slow_period": 13,
        "target_pips": 8.0,
        "stop_pips": 5.0,
        "breakeven_trigger_pips": 3.0,
        "trail_start_pips": 5.0,
        "trail_distance_pips": 2.0,
        "target_profit_per_trade": 60.0,
        "daily_profit_target": 600.0,
        "daily_loss_limit": 250.0,
        "max_trade_duration_minutes": 120.0,
    },
    {
        "name": "Ultra Fast Scalper",
        "description": "M1 timeframe, very quick in/out - 30 trades/day target",
        "max_position_size": 10000,
        "max_daily_loss": 200,
        "max_concurrent_positions": 1,
        "risk_per_trade_pct": 1.0,
        "profit_target_pips": 0,
        "stop_loss_pips": 3,
        "trailing_stop_enabled": True,
        "trailing_stop_activation_pips": 2,
        "trailing_stop_distance_pips": 1.5,
        "rsi_period": 7,
        "rsi_oversold": 30,
        "rsi_overbought": 70,
        "bb_period": 20,
        "bb_std_dev": 2.0,
        "atr_period": 14,
        "enabled_pairs": ["EUR/USD"],
        "trading_start_hour": 8,
        "trading_end_hour": 12,
        "max_trades_per_day": 30,
        "min_minutes_between_trades": 2,
        "max_spread_pips": 0.8,
        "min_volatility_atr": 0.0002,
        "max_volatility_atr": 0.001,
        "strategy_type": "scalping",
        "adx_period": 14,
        "max_adx_threshold": 30.0,
        "timeframe": "M1",
        "ema_fast_period": 3,
        "ema_slow_period": 8,
        "target_pips": 5.0,
        "stop_pips": 3.0,
        "breakeven_trigger_pips": 2.0,
        "trail_start_pips": 4.0,
        "trail_distance_pips": 1.5,
        "target_profit_per_trade": 50.0,
        "daily_profit_target": 500.0,
        "daily_loss_limit": 200.0,
        "max_trade_duration_minutes": 60.0,
    },
]


async def main():
    store = get_parameter_store()
    print("Creating scalping parameter presets...")

    for preset in SCALPING_PRESETS:
        try:
            existing = await store.list_all()
            for p in existing:
                if p.name == preset["name"]:
                    print(f"  ⚠️  '{preset['name']}' already exists, skipping...")
                    break
            else:
                created = await store.create(preset)
                print(f"  ✅ Created '{created.name}'")
        except Exception as e:
            print(f"  ❌ Error creating '{preset['name']}': {e}")

    print("\n✅ Scalping presets seed complete!")


if __name__ == "__main__":
    asyncio.run(main())
