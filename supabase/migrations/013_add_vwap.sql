-- Add VWAP Bias + Pullback indicator

INSERT INTO indicators (name, config, is_active)
VALUES
  (
    'vwap',
    '{"pullback_bps": 10, "reclaim_bps": 0, "use_close_confirmation": 1}',
    false
  )
ON CONFLICT (name) DO NOTHING;

-- Ensure account row exists for VWAP
INSERT INTO accounts (indicator_id, balance, equity, daily_loss, is_halted)
SELECT
  i.id,
  COALESCE((SELECT (value->>'value')::numeric FROM system_config WHERE key = 'default_balance'), 1000),
  COALESCE((SELECT (value->>'value')::numeric FROM system_config WHERE key = 'default_balance'), 1000),
  0,
  false
FROM indicators i
WHERE i.name = 'vwap'
ON CONFLICT (indicator_id) DO NOTHING;

-- Ensure performance metrics row exists for VWAP
INSERT INTO performance_metrics (indicator_id, total_trades, winrate, profit_factor, max_drawdown, score)
SELECT
  i.id,
  0,
  0,
  0,
  0,
  0
FROM indicators i
WHERE i.name = 'vwap'
ON CONFLICT (indicator_id) DO NOTHING;
