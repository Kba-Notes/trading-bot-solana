# Solana Trading Bot

A fully autonomous trading bot that executes a trend-following strategy on the Solana network using decentralized exchanges (DEXs) via the Jupiter API.

## Features

- **Automated Trading:** Executes buy and sell orders on Solana DEXs without manual intervention.
- **Configurable Strategy:** Implements a short-term swing trading strategy based on SMA crossovers and RSI confirmation on a 4-hour timeframe.
- **Market Health Filter:** Protects capital by analyzing the general market trend (BTC, ETH, SOL) on a daily timeframe before enabling buy orders.
- **Multi-Asset Monitoring:** Capable of monitoring and trading a configurable list of SPL tokens.
- **Real-time Notifications:** Sends instant trade execution and status alerts via Telegram.
- **Persistent Logging:** Records all actions, decisions, and errors to log files for easy troubleshooting, managed by Winston.
- **Process Management:** Runs continuously as a background service using PM2, with automatic restarts on failure or server reboot.

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

The list of assets to trade and strategy parameters can be configured in the `src/config.ts` file.

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

## Disclaimer

This software is for educational purposes only. It is not financial advice. Trading cryptocurrencies involves significant risk. Use this bot at your own risk and never invest more than you are willing to lose. Always start by running the bot in a simulated environment and with small amounts of capital.
