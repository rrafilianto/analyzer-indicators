-- Execution Logs Table
-- Stores structured logs per cron execution for debugging & auditing

CREATE TABLE IF NOT EXISTS execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error', 'debug')),
  indicator_name TEXT,
  message TEXT NOT NULL,
  context JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_execution_logs_request_id ON execution_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_execution_logs_created_at ON execution_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_execution_logs_level ON execution_logs(level);
CREATE INDEX IF NOT EXISTS idx_execution_logs_indicator ON execution_logs(indicator_name);
