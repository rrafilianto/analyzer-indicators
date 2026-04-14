-- Daily Loss History Table
-- Stores snapshot of daily loss + balance before each UTC midnight reset

CREATE TABLE IF NOT EXISTS daily_loss_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_id UUID NOT NULL REFERENCES indicators(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  daily_loss DECIMAL(16, 8) NOT NULL DEFAULT 0,
  daily_pnl DECIMAL(16, 8) NOT NULL DEFAULT 0,
  balance_before DECIMAL(16, 8) NOT NULL,
  balance_after DECIMAL(16, 8) NOT NULL,
  equity_before DECIMAL(16, 8) NOT NULL,
  trade_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(indicator_id, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_loss_history_date ON daily_loss_history(date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_loss_history_indicator ON daily_loss_history(indicator_id);
