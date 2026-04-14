-- Reset Tracker Table
-- Tracks when daily loss was last reset to enable auto-reset at UTC midnight

CREATE TABLE IF NOT EXISTS reset_tracker (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  last_reset_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB
);

-- Seed: daily_loss_reset tracker
INSERT INTO reset_tracker (key, last_reset_at)
VALUES ('daily_loss_reset', now() AT TIME ZONE 'UTC' - INTERVAL '1 day')
ON CONFLICT (key) DO NOTHING;
