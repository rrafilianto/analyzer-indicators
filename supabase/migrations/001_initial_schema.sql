-- BTC Futures Indicator Research Engine
-- Initial Schema Migration

-- ==========================================
-- 1. INDICATORS
-- ==========================================
CREATE TABLE IF NOT EXISTS indicators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  config JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==========================================
-- 2. ACCOUNTS (virtual account per indicator)
-- ==========================================
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_id UUID NOT NULL REFERENCES indicators(id) ON DELETE CASCADE,
  balance DECIMAL(16, 8) NOT NULL DEFAULT 1000.0,
  equity DECIMAL(16, 8) NOT NULL DEFAULT 1000.0,
  daily_loss DECIMAL(16, 8) NOT NULL DEFAULT 0.0,
  is_halted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(indicator_id)
);

-- ==========================================
-- 3. POSITIONS
-- ==========================================
CREATE TABLE IF NOT EXISTS positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_id UUID NOT NULL REFERENCES indicators(id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK (side IN ('long', 'short')),
  entry_price DECIMAL(16, 8) NOT NULL,
  stop_loss DECIMAL(16, 8) NOT NULL,
  take_profit DECIMAL(16, 8) NOT NULL,
  size DECIMAL(16, 8) NOT NULL,
  leverage INTEGER NOT NULL DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);

-- Index for fast lookup of open positions
CREATE INDEX IF NOT EXISTS idx_positions_open ON positions(indicator_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_positions_indicator ON positions(indicator_id);

-- ==========================================
-- 4. TRADES (closed position history)
-- ==========================================
CREATE TABLE IF NOT EXISTS multi_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  pnl DECIMAL(16, 8) NOT NULL,
  r_multiple DECIMAL(8, 4),
  duration INTEGER, -- in minutes
  exit_reason TEXT NOT NULL CHECK (exit_reason IN ('tp', 'sl', 'reverse')),
  exited_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_multi_trades_position ON multi_trades(position_id);
CREATE INDEX IF NOT EXISTS idx_multi_trades_indicator ON multi_trades USING btree (exited_at);

-- ==========================================
-- 5. PERFORMANCE METRICS
-- ==========================================
CREATE TABLE IF NOT EXISTS performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_id UUID NOT NULL REFERENCES indicators(id) ON DELETE CASCADE,
  total_trades INTEGER NOT NULL DEFAULT 0,
  winrate DECIMAL(5, 4) NOT NULL DEFAULT 0.0,
  profit_factor DECIMAL(10, 4) NOT NULL DEFAULT 0.0,
  max_drawdown DECIMAL(5, 4) NOT NULL DEFAULT 0.0,
  score DECIMAL(5, 4) NOT NULL DEFAULT 0.0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(indicator_id)
);

-- ==========================================
-- 6. SYSTEM CONFIG
-- ==========================================
CREATE TABLE IF NOT EXISTS system_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==========================================
-- SEED DATA
-- ==========================================

-- Insert 6 indicators
INSERT INTO indicators (name, config) VALUES
  ('ema_crossover', '{"fast_period": 9, "slow_period": 21}'),
  ('macd', '{"fast_period": 12, "slow_period": 26, "signal_period": 9}'),
  ('supertrend', '{"atr_period": 10, "multiplier": 3}'),
  ('rsi_70_30', '{"period": 14, "overbought": 70, "oversold": 30}'),
  ('rsi_50_cross', '{"period": 14, "midline": 50}'),
  ('bollinger', '{"period": 20, "std_dev": 2}')
ON CONFLICT (name) DO NOTHING;

-- Create accounts for each indicator with default balance
INSERT INTO accounts (indicator_id, balance, equity)
SELECT id, 1000.0, 1000.0 FROM indicators
ON CONFLICT (indicator_id) DO NOTHING;

-- Create performance metrics for each indicator
INSERT INTO performance_metrics (indicator_id)
SELECT id FROM indicators
ON CONFLICT (indicator_id) DO NOTHING;

-- Insert default system config
INSERT INTO system_config (key, value) VALUES
  ('max_daily_loss', '{"value": 100, "currency": "USD"}'),
  ('kill_switch', '{"enabled": false}'),
  ('default_balance', '{"value": 1000, "currency": "USD"}'),
  ('position_size', '{"value": 5, "currency": "USD"}'),
  ('leverage', '{"value": 5}')
ON CONFLICT (key) DO NOTHING;

-- ==========================================
-- FUNCTION: Update updated_at timestamp
-- ==========================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to tables with updated_at
CREATE TRIGGER update_indicators_updated_at
  BEFORE UPDATE ON indicators
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_accounts_updated_at
  BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_system_config_updated_at
  BEFORE UPDATE ON system_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_performance_metrics_updated_at
  BEFORE UPDATE ON performance_metrics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
