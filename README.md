# BTC Futures Indicator Research Engine

A production-oriented paper trading research engine for evaluating multiple BTCUSDT indicator strategies independently.

This project runs strategy evaluation on a 5-minute cycle, stores results in Supabase, and exposes both a web dashboard and Telegram commands for monitoring and control.

## Table of Contents

- [What This Project Does](#what-this-project-does)
- [Tech Stack](#tech-stack)
- [Core Features](#core-features)
- [System Architecture](#system-architecture)
- [Repository Structure](#repository-structure)
- [Trading Lifecycle](#trading-lifecycle)
- [Risk Management](#risk-management)
- [Metrics and Scoring](#metrics-and-scoring)
- [Data Model](#data-model)
- [API Endpoints](#api-endpoints)
- [Telegram Commands](#telegram-commands)
- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [Local Development Setup](#local-development-setup)
- [Running Tests and Lint](#running-tests-and-lint)
- [Deployment Notes](#deployment-notes)
- [Operations Runbook](#operations-runbook)
- [Resetting Data Safely](#resetting-data-safely)
- [Troubleshooting](#troubleshooting)

## What This Project Does

The system continuously evaluates indicator strategies using paper trading accounts (one account per indicator), then ranks strategy quality using performance metrics:

- Win rate
- Profit factor
- Max drawdown
- Composite score

It is designed as a research/selection engine before any live trading integration.

## Tech Stack

- `Next.js 15` (App Router)
- `React 19`
- `TypeScript`
- `Supabase` (`@supabase/supabase-js`)
- `technicalindicators`
- `Tailwind CSS`
- `Vitest`

## Core Features

- Independent virtual account per indicator
- Signal processing from Binance 5m candles
- Position lifecycle management:
  - open
  - close via TP/SL
  - reverse on opposite signal
- Global risk controls:
  - kill switch
  - max daily loss
  - UTC daily reset
- Dashboard with:
  - Balance, Equity
  - Realized/Unrealized PnL
  - Trades, Win rate, PF, Drawdown, Score
  - Indicator detail and trade history pagination
- Telegram operational commands for status/control
- Structured execution logging

## System Architecture

High-level flow:

1. Scheduler calls `/api/cron/trade` every 5 minutes.
2. Engine fetches latest candles and computes signals.
3. Position manager applies trading rules per indicator.
4. Account state is updated (balance, equity, daily loss).
5. Metrics are recalculated and persisted.
6. Dashboard and Telegram commands read from DB.

## Repository Structure

- `src/app`
  - UI pages (`/`, `/indicators/[name]`)
  - API routes (`/api/cron/*`, `/api/dashboard/*`, `/api/telegram/*`)
- `src/engine`
  - Trading core (`position-manager`, `risk-manager`, `metrics`, `equity`)
- `src/lib`
  - Integrations and helpers (Supabase, indicators, Telegram, logger)
- `src/components`
  - Dashboard and detail UI components
- `supabase/migrations`
  - Database schema and migration history
- `tests`
  - Unit tests for key pure logic

## Trading Lifecycle

Primary executor endpoint: `GET /api/cron/trade`

Execution steps:

1. Validate cron secret header (`x-cron-secret`).
2. Check global risk state (kill switch/max daily loss).
3. Trigger UTC auto-reset when day boundary is crossed.
4. Fetch BTCUSDT 5m candles.
5. Compute market structure.
6. Load active indicators.
7. Process each indicator signal:
   - check open position
   - apply TP/SL/reverse logic
   - prevent stacking
8. Sync mark-to-market equity.
9. Recalculate metrics.
10. Flush execution logs.

## Risk Management

Implemented in `src/engine/risk-manager.ts`.

Two layers:

- Indicator-level:
  - account can be halted (`accounts.is_halted`)
- Global-level:
  - kill switch (`system_config.kill_switch`)
  - max daily loss (`system_config.max_daily_loss`)

Daily reset behavior:

- runs on UTC boundary
- snapshots daily summary into `daily_loss_history`
- resets `accounts.daily_loss`
- updates `reset_tracker`

## Metrics and Scoring

Metrics are persisted in `performance_metrics`.

Computed metrics:

- `total_trades`
- `winrate`
- `profit_factor`
- `max_drawdown`
- `score`

Score formula:

`score = (winrate * 0.4) + (normalized_profit_factor * 0.3) + ((1 - drawdown) * 0.3)`

Where profit factor is normalized into a bounded range for scoring.

## Data Model

Main tables:

- `indicators`
- `accounts`
- `positions`
- `multi_trades` (primary trade history table)
- `performance_metrics`
- `system_config`
- `execution_logs`
- `reset_tracker`
- `daily_loss_history`

Notes:

- `multi_trades` is the canonical closed-trade table.
- Equity is mark-to-market and can differ from balance when a position is open.

## API Endpoints

### Trading/Cron

- `GET /api/cron/trade`
  - runs the trading cycle
  - requires `x-cron-secret` when configured
- `POST /api/cron/trade`
  - supports manual actions (for example daily reset action payload)

### Dashboard APIs

- `GET /api/dashboard/overview`
  - aggregate data for home dashboard
- `POST /api/dashboard/config`
  - update risk/config controls
- `GET /api/dashboard/indicator/[name]`
  - indicator detail data
  - supports trade pagination (`limit`, `offset`)
- `GET /api/dashboard/daily-history`
  - daily history records

### Telegram

- `POST /api/telegram/webhook`
  - Telegram command receiver
  - validates optional webhook secret header:
    - `x-telegram-bot-api-secret-token`

## Telegram Commands

Implemented in `src/lib/telegram-commands.ts`.

Current commands:

- `/help`
- `/status`
- `/leaderboard`
- `/pnl`
- `/position`
- `/killswitch on|off`

Behavior notes:

- webhook endpoint responds immediately
- command handling runs asynchronously
- loading replies are non-blocking to reduce response latency

## Prerequisites

- Node.js 20+
- npm
- Supabase project
- Binance public API access
- Telegram bot (optional but recommended for ops)

## Environment Variables

Copy `.env.local.example` to `.env.local` and fill values:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_PUBLISHABLE_KEY=your_publishable_key
SUPABASE_SECRET_KEY=your_secret_key

TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
TELEGRAM_CHAT_ID=your_personal_chat_id
TELEGRAM_WEBHOOK_SECRET=your_random_webhook_secret

CRON_SECRET=your_random_secret_string
```

## Local Development Setup

1. Install dependencies:

```bash
npm install
```

2. Create local env file:

```bash
cp .env.local.example .env.local
```

3. Fill `.env.local`.

4. Start development server:

```bash
npm run dev
```

Default local URL: `http://localhost:3000`

## Running Tests and Lint

Scripts from `package.json`:

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`

Vitest:

```bash
npx vitest run
```

## Deployment Notes

- Target platform: Vercel
- Configured region in `vercel.json`: `sin1`
- Ensure production env vars are set before enabling cron/webhooks

## Operations Runbook

Recommended daily checks:

1. Run `/status` in Telegram.
2. Verify kill switch is off unless intentionally enabled.
3. Verify at least one recent row in `execution_logs`.
4. Check dashboard equity and open positions.
5. Review `/pnl` and `/leaderboard` for drift/anomalies.

When incident happens:

- Enable kill switch (`/killswitch on`)
- Inspect recent execution logs
- Confirm API health and env values
- Resume with `/killswitch off` after validation

## Resetting Data Safely

For a clean research restart, reset runtime/trading tables and state:

- clear:
  - `positions`
  - `multi_trades`
  - `execution_logs`
  - `daily_loss_history`
- reset:
  - `accounts` (balance/equity/daily_loss/is_halted)
  - `performance_metrics`
  - `system_config` defaults (if needed)
  - `reset_tracker`

Always verify reset scope before execution in production environments.

## Troubleshooting

- **Cron returns `Unauthorized`**
  - Check `CRON_SECRET` and request header `x-cron-secret`.

- **Telegram bot is slow to respond**
  - Check network latency to Telegram API.
  - Inspect DB query latency in command handlers.
  - Confirm webhook endpoint returns `200` quickly.

- **No data on dashboard**
  - Verify `indicators`, `accounts`, and `performance_metrics` are populated.
  - Check Supabase credentials in env.

- **Equity looks wrong**
  - Verify open position exists and current price fetch works.
  - Equity should be `balance + unrealized_pnl`.

- **Daily history shows unexpected values**
  - Confirm UTC reset flow and `daily_loss_history` snapshot logic.
  - Validate `multi_trades` data consistency.

