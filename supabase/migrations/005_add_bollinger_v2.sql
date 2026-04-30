-- Add Bollinger Bands V2 indicator seed
-- Keeps existing bollinger strategy intact and introduces a new variant.

INSERT INTO indicators (name, config, is_active)
VALUES ('bollinger_v2', '{"period": 20, "std_dev": 2}', false)
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
WHERE i.name = 'bollinger_v2'
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
WHERE i.name = 'bollinger_v2'
ON CONFLICT (indicator_id) DO NOTHING;
