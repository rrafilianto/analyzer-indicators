# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
The BTC Futures Indicator Research Engine is a paper trading system designed to evaluate multiple BTCUSDT indicator strategies independently on a 5-minute cycle. It uses a serverless architecture (Next.js on Vercel) with Supabase for persistence and a Telegram bot for operational control.

## Common Commands
- Development: `npm run dev`
- Build: `npm run build`
- Start: `npm run start`
- Lint: `npm run lint`
- Tests: `npx vitest run`

## Architecture
The system follows a layered architecture to decouple indicator logic from trading execution:

- **Frontend (`src/app` & `src/components`)**: Next.js App Router dashboard for monitoring performance metrics, equity curves, and controlling system risk.
- **API Layer (`src/app/api`)**: 
  - `/api/cron/trade`: The primary execution entry point triggered every 5 minutes.
  - `/api/dashboard/*`: Data endpoints for the web UI.
  - `/api/telegram/webhook`: Command receiver for Telegram bot operations.
- **Engine (`src/engine`)**: Core trading logic.
  - `trading-engine.ts`: Orchestrates the trading cycle.
  - `position-manager.ts`: Handles entry, exit, TP/SL, and reverse signal logic.
  - `risk-manager.ts`: Implements global kill switches and daily loss limits.
  - `metrics.ts` & `equity.ts`: Calculates performance scores (Win Rate, Profit Factor, Drawdown) and mark-to-market equity.
- **Library (`src/lib`)**:
  - `indicators/`: Implementation of the 6 research indicators.
  - `supabase.ts`: Database client and types.
  - `telegram.ts` & `telegram-commands.ts`: Telegram API integration and command handling.

## Trading Logic Key Details
- **Execution**: Occurs on candle close (5m timeframe).
- **Risk**: 
  - Market Structure-based Stop Loss (confirmed Higher Low/Lower High).
  - Fixed Risk-Reward ratio (RR 1:2).
  - Global Kill Switch and Max Daily Loss (UTC daily reset).
- **Scoring**: Indicators are ranked by a composite score: `(winrate * 0.4) + (normalized_profit_factor * 0.3) + ((1 - drawdown) * 0.3)`.
- **Abstraction**: The `TradingEngine` interface allows the system to switch from `PaperTradingEngine` to a `LiveTradingEngine` without modifying indicator or risk logic.
