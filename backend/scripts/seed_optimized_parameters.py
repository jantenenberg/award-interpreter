"""Seed script to create optimized parameter presets for backtesting."""

import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.store.parameters import get_parameter_store


PRESETS = [
    {
        "name": "Ultra Conservative",
        "description": "Strict entry criteria for higher win rate - waits for extreme oversold/overbought conditions",
        "max_position_size": 10000,
        "max_daily_loss": 200,
        "max_concurrent_positions": 3,
        "risk_per_trade_pct": 1.0,
        "profit_target_pips": 0,
        "stop_loss_pips": 20,
        "trailing_stop_enabled": True,
        "trailing_stop_activation_pips": 10,
        "trailing_stop_distance_pips": 5,
        "rsi_period": 14,
        "rsi_oversold": 25,
        "rsi_overbought": 75,
        "bb_period": 20,
        "bb_std_dev": 2.5,
        "atr_period": 14,
        "enabled_pairs": ["EUR/USD", "GBP/USD", "USD/JPY"],
        "trading_start_hour": 7,
        "trading_end_hour": 16,
        "max_trades_per_day": 3,
        "min_minutes_between_trades": 60,
        "max_spread_pips": 1.5,
        "min_volatility_atr": 0.0003,
        "max_volatility_atr": 0.0008,
        "strategy_type": "mean_reversion",
        "adx_period": 14,
        "max_adx_threshold": 25.0,
    },
    {
        "name": "Selective Entry",
        "description": "Balanced approach with confirmation filters - moderate entry criteria",
        "max_position_size": 10000,
        "max_daily_loss": 300,
        "max_concurrent_positions": 3,
        "risk_per_trade_pct": 1.5,
        "profit_target_pips": 0,
        "stop_loss_pips": 20,
        "trailing_stop_enabled": True,
        "trailing_stop_activation_pips": 10,
        "trailing_stop_distance_pips": 5,
        "rsi_period": 14,
        "rsi_oversold": 27,
        "rsi_overbought": 73,
        "bb_period": 20,
        "bb_std_dev": 2.3,
        "atr_period": 14,
        "enabled_pairs": ["EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD"],
        "trading_start_hour": 7,
        "trading_end_hour": 16,
        "max_trades_per_day": 4,
        "min_minutes_between_trades": 45,
        "max_spread_pips": 2.0,
        "min_volatility_atr": 0.00025,
        "max_volatility_atr": 0.0009,
        "strategy_type": "mean_reversion",
        "adx_period": 14,
        "max_adx_threshold": 25.0,
    },
    {
        "name": "High Risk Reward",
        "description": "Wait for extreme reversals, target large moves - fewer trades but higher profit per trade",
        "max_position_size": 10000,
        "max_daily_loss": 400,
        "max_concurrent_positions": 2,
        "risk_per_trade_pct": 2.0,
        "profit_target_pips": 0,
        "stop_loss_pips": 20,
        "trailing_stop_enabled": True,
        "trailing_stop_activation_pips": 10,
        "trailing_stop_distance_pips": 5,
        "rsi_period": 14,
        "rsi_oversold": 20,
        "rsi_overbought": 80,
        "bb_period": 20,
        "bb_std_dev": 3.0,
        "atr_period": 14,
        "enabled_pairs": ["EUR/USD", "GBP/USD"],
        "trading_start_hour": 7,
        "trading_end_hour": 16,
        "max_trades_per_day": 3,
        "min_minutes_between_trades": 60,
        "max_spread_pips": 2.0,
        "min_volatility_atr": 0.0003,
        "max_volatility_atr": 0.001,
        "strategy_type": "mean_reversion",
        "adx_period": 14,
        "max_adx_threshold": 25.0,
    },
]


async def main():
    store = get_parameter_store()
    print("Creating optimized parameter presets...")
    
    for preset in PRESETS:
        try:
            existing = await store.list_all()
            # Check if preset already exists
            for p in existing:
                if p.name == preset["name"]:
                    print(f"  ⚠️  '{preset['name']}' already exists, skipping...")
                    break
            else:
                created = await store.create(preset)
                print(f"  ✅ Created '{created.name}'")
        except Exception as e:
            print(f"  ❌ Error creating '{preset['name']}': {e}")
    
    print("\n✅ Seed complete! You can now use these parameter sets in backtests.")


if __name__ == "__main__":
    asyncio.run(main())
