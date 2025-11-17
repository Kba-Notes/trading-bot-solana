# Solana Trading Bot

A fully autonomous trading bot that executes a trend-following strategy on the Solana network using decentralized exchanges (DEXs) via the Jupiter API.

## Features

### Core Trading
- **Automated Trading:** Executes buy and sell orders on Solana DEXs without manual intervention
- **Golden Cross Strategy:** SMA(12) × SMA(26) crossover with RSI(14) > 50 confirmation on 1-hour timeframe
- **Market Health Filter:** Analyzes BTC (25%), ETH (25%), and SOL (50%) trends to protect capital during bearish markets
- **Multi-Asset Monitoring:** Trades configurable SPL tokens (currently: JUP, WIF, PENG, BONK)

### Risk Management
- **Dynamic Exit Strategy:**
  - Stop Loss: -1% from entry (consistent tight risk management)
  - Trailing Stop: Activates immediately at any profit, trails 1% below highest price
  - No Take Profit: Trailing stop manages all exits for maximum upside capture
- **Smart Entry Filters:**
  - Trend strength: Requires minimum 0.1% SMA slope
  - Volatility filter: Pauses trading when volatility > 5%
- **Position Persistence:** Saves positions to disk, survives bot restarts

### Monitoring & Alerts
- **Dual-Speed Monitoring:**
  - Main analysis cycle: Every 15 minutes (finds new opportunities) - 96 checks/day
  - Position monitoring: Every 1 minute (real-time TP/SL execution) - 1,440 checks/day
- **Enhanced Telegram Notifications:**
  - Detailed trade alerts with entry price, indicators, and P&L
  - Cycle summaries with market health and buy signals
  - Heartbeat messages every 6 cycles
- **Interactive Telegram Commands:**
  - `/logs [minutes]` - Get recent logs on-demand (1-60 minutes, default 1)
  - `/status` - Get instant position snapshot with real-time P&L
  - `/help` - Show available commands
  - Chat ID verification for security
- **Performance Metrics:** Tracks API success rates, execution times, and uptime

### Reliability
- **Graceful Shutdown:** SIGTERM/SIGINT handlers with proper cleanup
- **Environment Validation:** Checks all required API keys at startup
- **Retry Logic:** Automatic retries with exponential backoff for API failures
- **Persistent Logging:** Winston-based structured logging with automatic rotation
  - Daily log files with 10MB max size
  - 7-day retention policy (auto-delete old logs)
  - Prevents unbounded log file growth
- **Process Management:** PM2 integration with automatic restarts

## Architecture

The bot is built with a modular architecture, separating concerns into four main components:

1.  **Data Extractor:** Fetches real-time prices and historical candle data from external APIs (Jupiter, CoinGecko, GeckoTerminal).
2.  **Strategy Analyzer:** Contains the core trading logic. It calculates technical indicators and the market health index to generate `BUY` or `HOLD` signals.
3.  **Order Executor:** Manages the portfolio state and executes real trades on the Solana blockchain by building, signing, and sending transactions via the Jupiter API.
4.  **Notifier & Logger:** Provides real-time feedback via Telegram and maintains a persistent, structured log of all bot activities.

## Tech Stack

- **Language:** TypeScript
- **Runtime:** Node.js
- **Primary Blockchain:** Solana
- **DEX Aggregation:** Jupiter API
- **Market Data:**
  - CoinGecko API (Market Health: BTC, ETH, SOL)
  - GeckoTerminal API (Historical OHLCV for trading assets)
  - Jupiter API (Real-time prices and swap execution)
- **Process Management:** PM2
- **Logging:** Winston
- **Real-time Notifications:** Telegram Bot API

## Configuration

The bot is configured through environment variables. Create a `.env` file in the root of the project with the following variables:

```
# Your dedicated hot wallet's private key in bs58 format
PRIVATE_KEY="YourPrivateKeyHere"

# Your Telegram bot token from BotFather
TELEGRAM_TOKEN="YourTelegramBotToken"

# Your personal Telegram Chat ID
TELEGRAM_CHAT_ID="YourTelegramChatID"
```

**Note:** All market data APIs used by this bot are free and do not require API keys:
- **CoinGecko:** Free tier for BTC/ETH/SOL market health data
- **GeckoTerminal:** Free tier (30 req/min) for historical OHLCV candles
- **Jupiter:** Free tier (1 RPS) for real-time prices and swaps

### Strategy Parameters

Configure trading behavior in `src/config.ts`:

```typescript
export const strategyConfig = {
    timeframe: '1h',                // 1-hour candles for faster signals
    tradeAmountUSDC: 500,           // Amount per trade
    stopLossPercentage: 0.01,       // 1% stop loss from entry
    shortSMAPeriod: 12,             // Fast moving average
    longSMAPeriod: 26,              // Slow moving average
    rsiPeriod: 14,
    rsiThreshold: 50,               // RSI threshold (optional filter)
    requireRsiConfirmation: false,  // Disabled by default for meme coins
};

// Monitoring intervals
export const BOT_EXECUTION_INTERVAL = 15 * 60 * 1000;   // 15 minutes (96 checks/day)
export const POSITION_CHECK_INTERVAL = 1 * 60 * 1000;   // 1 minute (1,440 checks/day)
```

### Tradeable Assets

Modify the asset list in `src/config.ts`:

```typescript
export const assetsToTrade = [
    {
        name: 'JUP',
        mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
        geckoPool: 'C8Gr6AUuq9hEdSYJzoEpNcdjpojPZwqG5MtQbeouNNwg'
    },
    {
        name: 'WIF',
        mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
        geckoPool: 'EP2ib6dYdEeqD8MfE2ezHCxX3kP3K2eLKkirfPm5eyMx'
    },
    // Add more SPL tokens here with their GeckoTerminal pool addresses
];
```

**To add new tokens:**
1. Find the token mint address
2. Look up the GeckoTerminal pool address at [geckoterminal.com](https://www.geckoterminal.com/solana/pools)

## Installation and Usage

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/Kba-Notes/trading-bot-solana.git](https://github.com/Kba-Notes/trading-bot-solana.git)
    cd trading-bot-solana
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Create and configure the `.env` file** as described above.

4.  **Compile the TypeScript code:**
    ```bash
    npm run build
    ```

5.  **Start the bot** with PM2:
    ```bash
    pm2 start dist/bot.js --name "trading-bot"
    ```

6.  **Save the process list** to have it restart on server reboot:
    ```bash
    pm2 save
    ```

### Monitoring the Bot

-   **Check status:** `pm2 status`
-   **View live logs:** `pm2 logs trading-bot`
-   **Restart the bot:** `pm2 restart trading-bot`
-   **Stop the bot:** `pm2 stop trading-bot`

## Trading Strategy Details

### Entry Conditions (All must be true)
1. **Market Health Index > 0** - Overall crypto market is bullish (BTC/ETH/SOL weighted on 1-hour SMA)
2. **Golden Cross** - SMA(12) crosses above SMA(26) - PRIMARY SIGNAL
3. **RSI > 50** - Optional momentum confirmation (disabled by default for aggressive meme coin entries)
4. **Trend Strength** - SMA slope > 0.1% (filters weak trends)
5. **Low Volatility** - Average volatility < 5% (avoids choppy markets)

### Exit Conditions
- **Stop Loss:** Price drops to -1% from entry (consistent with trailing stop)
- **Trailing Stop:**
  - Activates immediately when price > entry (any profit)
  - Trails 1% below the highest price seen (tightened from 3% based on data)
  - Sells when price drops 1% from the highest price (not from entry)
  - Locks in profits while allowing unlimited upside
  - Monitored every 1 minute for accurate peak capture
  - Example: Buy at $0.100, price hits $0.103 (+3%) → Trailing at $0.10197 locks +1.97% profit
  - Data shows: 1% trailing captured +3.91% vs -2.54% with 3% trailing (24h backtest)
- **No Take Profit:** Removed to let trailing stop manage all exits

### Expected Performance
- **Win Rate:** 50-60%
- **Risk/Reward Ratio:** 3:1 to 6:1 (improved with 1-minute monitoring)
- **Average Win:** +10% to +20% (better peak capture with 1-min checks)
- **Average Loss:** -1%

## Version History

See [CHANGELOG.md](CHANGELOG.md) for detailed version history and updates.

**Current Version:** 2.7.3

### Latest Updates (v2.7.3)
- **JTO Removed from Monitored Assets** - Portfolio optimization based on performance data
  - JTO identified as least effective and too volatile, causing losses
  - Bot now monitors 4 assets: JUP, WIF, PENG, BONK
  - More focused portfolio with reduced exposure to underperforming asset
  - Existing JTO positions continue to be monitored until exit

### Previous Updates (v2.7.2)
- **Improved Log Clarity** - Cleaner analysis logs with less redundancy
  - Asset name shown first (not truncated address)
  - Removed duplicate SMA/RSI data
  - Golden Cross only logged when it actually occurs
  - Better log organization and readability
- **Race Condition Fix** - Prevented duplicate sell attempts from concurrent loops
  - Fixes ghost positions from failed sell retries
  - Position existence check before sell execution

### Previous Updates (v2.7.1)
- **Stop Loss: 3% → 1%** - Consistent risk management
  - Stop loss and trailing stop now both at -1%
  - Coherent risk strategy across all exit conditions
  - Average loss reduced from -3% to -1%

### Previous Updates (v2.7.0)
- **Analysis Cycle: 60 min → 15 min** - 4x faster buy detection
  - Main analysis now runs every 15 minutes (96 checks/day)
  - Catches Golden Cross signals within 15 minutes vs up to 1 hour
  - Better entry timing for fast-moving meme coins
  - Position monitoring still at 1 minute for accurate trailing stops

### Previous Updates (v2.6.0)
- **Trailing Stop Tightened: 3% → 1%** - Data-driven optimization
  - 24h backtest: 1% trailing = +3.91% vs 3% trailing = -2.54%
  - Better profit capture on small meme coin moves (1-3%)
  - With 1-min monitoring, 1% avoids noise while locking gains

### Previous Updates (v2.5.0)
- **Immediate Trailing Stop Activation** - Trailing now activates at any profit (even 0.1%), not just +1%
  - Better protection for small gains before reversal
  - Consistent logic: activation and updates both use "any new high"
- **Polished Position Logs** - Cleaner, more actionable monitoring information
  - Shows potential P&L if trailing stop is hit (risk/reward visibility)
  - Removed redundant prices and dollar amounts for clarity

### Previous Updates (v2.4.0)
- **Stateful Golden Cross Detection** - Eliminated missed opportunities by tracking state across cycles
- **Enhanced Log Formatting** - Cleaner, more readable logs with absolute dollar values
- **Complete Targets Visibility** - Shows distances to both new highs and trailing stops
- **Interactive Telegram Commands** - On-demand logs and status via `/logs`, `/status`, `/help`
- **Automatic Log Rotation** - Daily rotation with 7-day retention, prevents unbounded growth
- **8 Decimal Precision** - Better visibility for low-price tokens like BONK

## Disclaimer

This software is for educational purposes only. It is not financial advice. Trading cryptocurrencies involves significant risk. Use this bot at your own risk and never invest more than you are willing to lose. Always start by running the bot in a simulated environment and with small amounts of capital.
