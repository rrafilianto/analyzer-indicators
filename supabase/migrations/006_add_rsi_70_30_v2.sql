-- Add RSI 70/30 V2 indicator seed
-- Keeps existing rsi_70_30 strategy intact and introduces cross-based variant.

INSERT INTO indicators (name, config, is_active)
VALUES ('rsi_70_30_v2', '{"period": 14, "overbought": 70, "oversold": 30}', false)
ON CONFLICT (name) DO NOTHING;

-- Ensure account row exists for the new indicator
INSERT INTO accounts (indicator_id, balance, equity, daily_loss, is_halted)
SELECT
  i.id,
  COALESCE((SELECT (value->>'value')::numeric FROM system_config WHERE key = 'default_balance'), 1000),
  COALESCE((SELECT (value->>'value')::numeric FROM system_config WHERE key = 'default_balance'), 1000),
  0,
  false
FROM indicators i
WHERE i.name = 'rsi_70_30_v2'
ON CONFLICT (indicator_id) DO NOTHING;

-- Ensure metrics row exists for the new indicator
INSERT INTO performance_metrics (indicator_id, total_trades, winrate, profit_factor, max_drawdown, score)
SELECT
  i.id,
  0,
  0,
  0,
  0,
  0
FROM indicators i
WHERE i.name = 'rsi_70_30_v2'
ON CONFLICT (indicator_id) DO NOTHING;
