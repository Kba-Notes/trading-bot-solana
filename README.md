# Solana Trading Bot

A fully autonomous trading bot that executes a trend-following strategy on the Solana network using decentralized exchanges (DEXs) via the Jupiter API.

## Features

### Core Trading
- **Automated Trading:** Executes buy and sell orders on Solana DEXs without manual intervention
- **Golden Cross Strategy:** SMA(12) × SMA(26) crossover with RSI(14) > 50 confirmation on 1-hour timeframe
- **Market Health Filter:** Analyzes BTC (25%), ETH (25%), and SOL (50%) trends to protect capital during bearish markets
- **Multi-Asset Monitoring:** Trades configurable SPL tokens (currently: JUP, JTO, WIF, PENG, BONK)

### Risk Management
- **Dynamic Exit Strategy:**
  - Take Profit: +8% (optimized for meme coin volatility)
  - Stop Loss: -3% (reduces false stops)
  - Trailing Stop: Activates at +2%, trails 3% below highest price
- **Smart Entry Filters:**
  - Trend strength: Requires minimum 0.1% SMA slope
  - Volatility filter: Pauses trading when volatility > 5%
- **Position Persistence:** Saves positions to disk, survives bot restarts

### Monitoring & Alerts
- **Dual-Speed Monitoring:**
  - Main analysis cycle: Every 1 hour (finds new opportunities) - 24 checks/day
  - Position monitoring: Every 15 minutes (fast TP/SL execution)
- **Enhanced Telegram Notifications:**
  - Detailed trade alerts with entry price, indicators, and P&L
  - Cycle summaries with market health and buy signals
  - Heartbeat messages every 6 cycles
- **Performance Metrics:** Tracks API success rates, execution times, and uptime

### Reliability
- **Graceful Shutdown:** SIGTERM/SIGINT handlers with proper cleanup
- **Environment Validation:** Checks all required API keys at startup
- **Retry Logic:** Automatic retries with exponential backoff for API failures
- **Persistent Logging:** Winston-based structured logging to file and console
- **Process Management:** PM2 integration with automatic restarts

## Architecture

The bot is built with a modular architecture, separating concerns into four main components:

1.  **Data Extractor:** Fetches real-time prices and historical candle data from external APIs (Jupiter, CoinGecko, Birdeye).
2.  **Strategy Analyzer:** Contains the core trading logic. It calculates technical indicators and the market health index to generate `BUY` or `HOLD` signals.
3.  **Order Executor:** Manages the portfolio state and executes real trades on the Solana blockchain by building, signing, and sending transactions via the Jupiter API.
4.  **Notifier & Logger:** Provides real-time feedback via Telegram and maintains a persistent, structured log of all bot activities.

## Tech Stack

- **Language:** TypeScript
- **Runtime:** Node.js
- **Primary Blockchain:** Solana
- **DEX Aggregation:** Jupiter API
- **Market Data:** CoinGecko API, Birdeye API
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

# Your free API key from birdeye.so
BIRDEYE_API_KEY="YourBirdeyeAPIKey"
```

### Strategy Parameters

Configure trading behavior in `src/config.ts`:

```typescript
export const strategyConfig = {
    timeframe: '1h',                // 1-hour candles for faster signals
    tradeAmountUSDC: 500,           // Amount per trade
    takeProfitPercentage: 0.08,     // 8% take profit
    stopLossPercentage: 0.03,       // 3% stop loss
    shortSMAPeriod: 12,             // Fast moving average
    longSMAPeriod: 26,              // Slow moving average
    rsiPeriod: 14,
    rsiThreshold: 50,               // RSI must be above this
};

// Monitoring intervals
export const BOT_EXECUTION_INTERVAL = 1 * 60 * 60 * 1000;   // 1 hour (24 checks/day)
export const POSITION_CHECK_INTERVAL = 15 * 60 * 1000;      // 15 minutes
```

### Tradeable Assets

Modify the asset list in `src/config.ts`:

```typescript
export const assetsToTrade = [
    { name: 'JUP', mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN' },
    { name: 'JTO', mint: 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL' },
    // Add more SPL tokens here
];
```

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
1. **Market Health Index > 0** - Overall crypto market is bullish
2. **Golden Cross** - SMA(12) crosses above SMA(26)
3. **RSI > 50** - Momentum confirmation
4. **Trend Strength** - SMA slope > 0.1% (filters weak trends)
5. **Low Volatility** - Average volatility < 5% (avoids choppy markets)

### Exit Conditions
- **Take Profit:** Price reaches +8% from entry
- **Stop Loss:** Price drops to -3% from entry
- **Trailing Stop:**
  - Activates when price reaches +2% profit
  - Trails 3% below the highest price seen
  - Locks in profits while allowing upside

### Expected Performance
- **Win Rate:** 50-60%
- **Risk/Reward Ratio:** 2.5:1 to 5:1
- **Average Win:** +8% to +15%
- **Average Loss:** -3%

## Version History

See [CHANGELOG.md](CHANGELOG.md) for detailed version history and updates.

**Current Version:** 2.2.0

## Disclaimer

This software is for educational purposes only. It is not financial advice. Trading cryptocurrencies involves significant risk. Use this bot at your own risk and never invest more than you are willing to lose. Always start by running the bot in a simulated environment and with small amounts of capital.
