-- Add V2 + ADX filtered clones
-- Introduces:
-- - bollinger_v2_adx
-- - rsi_70_30_v2_adx

INSERT INTO indicators (name, config, is_active)
VALUES
  ('bollinger_v2_adx', '{"period": 20, "std_dev": 2, "adx_period": 14, "adx_threshold": 20, "enable_adx_filter": 1}', false),
  ('rsi_70_30_v2_adx', '{"period": 14, "overbought": 70, "oversold": 30, "adx_period": 14, "adx_threshold": 20, "enable_adx_filter": 1}', false)
ON CONFLICT (name) DO NOTHING;

-- Ensure account rows exist for new indicators
INSERT INTO accounts (indicator_id, balance, equity, daily_loss, is_halted)
SELECT
  i.id,
  COALESCE((SELECT (value->>'value')::numeric FROM system_config WHERE key = 'default_balance'), 1000),
  COALESCE((SELECT (value->>'value')::numeric FROM system_config WHERE key = 'default_balance'), 1000),
  0,
  false
FROM indicators i
WHERE i.name IN ('bollinger_v2_adx', 'rsi_70_30_v2_adx')
ON CONFLICT (indicator_id) DO NOTHING;

-- Ensure metrics rows exist for new indicators
INSERT INTO performance_metrics (indicator_id, total_trades, winrate, profit_factor, max_drawdown, score)
SELECT
  i.id,
  0,
  0,
  0,
  0,
  0
FROM indicators i
WHERE i.name IN ('bollinger_v2_adx', 'rsi_70_30_v2_adx')
ON CONFLICT (indicator_id) DO NOTHING;
