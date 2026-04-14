# 📄 PRODUCT REQUIREMENTS DOCUMENT

## Project Name: BTC Futures Indicator Research Engine

---

# 1️⃣ Overview

## 1.1 Background

Sistem ini adalah research engine untuk menguji performa masing-masing indikator secara independen pada market BTCUSDT Binance Futures menggunakan metode paper trading.

Tujuan utama:

* Mengukur performa indikator secara individual
* Menentukan indikator mana yang layak digunakan untuk live trading
* Membangun arsitektur yang mudah di-upgrade ke mode live trading

---

## 1.2 Goals

* Mengevaluasi 6 indikator secara paralel
* Menggunakan market structure untuk stop loss
* Menggunakan RR 1:2
* Menggunakan paper trading dengan virtual account terpisah
* Menyediakan dashboard analitik
* Siap di-upgrade ke live trading

---

# 2️⃣ Scope

## In Scope (Phase 1)

* BTCUSDT Binance Futures
* Timeframe 5m
* Cron execution tiap 5 menit
* Paper trading only
* 6 indikator terpisah
* Risk management global
* Scoring sederhana
* Dashboard manual refresh

## Out of Scope

* Multi-user
* Multi-pair
* Real-time websocket
* Subscription system
* Copy trading

---

# 3️⃣ Indicators Specification

Total Virtual Account: 6

## 3.1 EMA Crossover

* EMA 9 & EMA 21
* Long: EMA9 cross above EMA21
* Short: EMA9 cross below EMA21

## 3.2 MACD

* Default (12,26,9)
* Long: MACD cross up
* Short: MACD cross down

## 3.3 Supertrend

* ATR 10
* Multiplier 3
* Signal mengikuti trend flip

## 3.4 RSI (70/30)

* Period 14
* Long: RSI < 30
* Short: RSI > 70

## 3.5 RSI (50 Cross)

* Period 14
* Long: RSI cross above 50
* Short: RSI cross below 50

## 3.6 Bollinger Bands

* Period 20
* Deviasi 2
* Long: close di bawah lower band
* Short: close di atas upper band

---

# 4️⃣ Trading Rules Engine

## 4.1 Entry

* Market order
* Eksekusi saat candle close
* Cron tiap 5 menit

## 4.2 Stop Loss (Market Structure)

Long:

* SL = last confirmed Higher Low

Short:

* SL = last confirmed Lower High

Non-repainting algorithm.

## 4.3 Take Profit

RR 1:2

TP = Entry + 2 × Risk (Long)
TP = Entry − 2 × Risk (Short)

## 4.4 Position Rules

* Tidak boleh stacking
* Jika reverse signal muncul:

  * Close posisi lama
  * Hitung PnL
  * Buka posisi baru

## 4.5 Position Size

* Fixed $5
* Leverage 5x
* Configurable

---

# 5️⃣ Risk Management Layer

## 5.1 Per Indicator

* Balance terpisah
* Equity terpisah

## 5.2 Global Risk

* Max daily loss (configurable)
* Reset UTC 00:00
* Kill switch manual

Jika max daily loss tercapai:

* Semua indikator berhenti trading hari itu

---

# 6️⃣ Paper Trading Engine

## 6.1 Execution Flow

Cron Trigger →
Fetch latest 5m candle →
Hitung semua indikator (parallel) →
Cek open position →
Apply logic (entry/exit/reverse) →
Hitung PnL →
Update database →
Recalculate metrics

---

## 6.2 PnL Calculation

PnL = (Exit - Entry) × Size × Leverage (Long)
PnL = (Entry - Exit) × Size × Leverage (Short)

Fee simulation optional (future enhancement).

---

# 7️⃣ Scoring System

Formula:

Score =
(Winrate × 0.4) +
(Profit Factor × 0.3) +
((1 - Drawdown%) × 0.3)

Tujuan:

* Ranking indikator
* Menentukan kandidat live trading

---

# 8️⃣ Database Design (Supabase)

## 8.1 Tables

### indicators

* id
* name
* config (jsonb)
* is_active

### accounts

* id
* indicator_id
* balance
* equity
* daily_loss
* is_halted

### positions

* id
* indicator_id
* side
* entry_price
* stop_loss
* take_profit
* size
* leverage
* status (open/closed)
* opened_at
* closed_at

### trades

* id
* position_id
* pnl
* r_multiple
* duration
* exit_reason (tp/sl/reverse)

### performance_metrics

* indicator_id
* total_trades
* winrate
* profit_factor
* max_drawdown
* score
* updated_at

### system_config

* max_daily_loss
* kill_switch
* default_balance
* position_size

---

# 9️⃣ Architecture

## Tech Stack

* NextJS (App Router)
* Supabase (DB + Auth optional)
* Vercel Serverless Function
* Cron-job.org (5 menit)

---

## Execution Architecture

Cron →
Vercel API Route →
Indicator Engine (parallel Promise.all) →
Trading Engine Interface →
PaperTradingEngine →
Supabase update

---

# 10️⃣ Interface Design (Engine Layer)

Abstraction Layer:

TradingEngine Interface:

* openPosition()
* closePosition()
* updateBalance()
* calculatePnL()

Implementation:

* PaperTradingEngine
* LiveTradingEngine (future)

Sehingga upgrade live hanya mengganti engine implementation.

---

# 11️⃣ Dashboard Requirements

## 11.1 Overview Panel

* Balance per indikator
* Equity curve chart
* Daily PnL
* Kill switch status

## 11.2 Indicator Detail Page

* Trade history
* Winrate
* Profit factor
* Drawdown
* Score
* Open position info

## 11.3 Controls

* Refresh button
* Toggle indicator on/off
* Update risk config
* Kill switch

Manual refresh only.

---

# 12️⃣ Upgrade Path ke Live Trading

Ketika ready:

1. Tambah Binance API integration
2. Implement LiveTradingEngine
3. Simpan API key di Vercel Environment Variable
4. Tambah order execution validation
5. Tambah slippage & fee model

Tidak perlu ubah:

* Indicator logic
* Risk logic
* Scoring
* Database schema

---

# 13️⃣ Non Functional Requirements

* Stateless execution
* Deterministic calculation
* Idempotent cron execution
* Logging per execution
* Error isolation per indikator
* Execution time < 10s

---

# 14️⃣ Development Phases

Phase 1:

* Database schema
* Indicator engine
* Market structure module

Phase 2:

* Paper trading engine
* Risk layer
* Reverse logic

Phase 3:

* Dashboard UI
* Metrics calculation
* Scoring

Phase 4:

* Optimization & logging

---

# 🚀 Final Architecture Level

Ini adalah:

* Quant Research Engine mini
* Serverless friendly
* Clean abstraction
* Upgradeable ke production trading
