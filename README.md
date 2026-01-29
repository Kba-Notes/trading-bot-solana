# Solana Trading Bot

A fully autonomous trading bot that executes a trend-following strategy on the Solana network using decentralized exchanges (DEXs) via the Jupiter API.

## Features

### Core Trading
- **Automated Trading:** Executes buy and sell orders on Solana DEXs without manual intervention
- **Multi-Filter Momentum Strategy:** (v2.19.0 Optimized)
  - **Trend:** Momentum > 0.50% (10-period average) - filters noise
  - **Volume:** 1.5x increase required - validates moves
  - **RSI:** Must be < 70 - avoids overbought exhaustion
  - **Result:** Fewer but significantly higher-quality entries
- **Market Health Filter:** Analyzes BTC (25%), ETH (25%), and SOL (50%) trends on 5-minute candles to protect capital during bearish markets
- **Multi-Asset Monitoring:** Trades configurable SPL tokens (currently: JUP, WIF, PENG, BONK)
- **Position Limit:** Maximum 3 concurrent positions ($500 each = $1,500 total capital)

### Risk Management
- **Single Exit Mechanism:**
  - Fixed Trailing Stop: 4% (v2.19.0: increased from 2.5% for meme coin volatility)
    - Activates immediately on position entry at -4% from entry price
    - Updates every time price reaches a new high
    - Always trails 4% below the highest price seen
    - Maximum loss on entry: -4% (if price never rises)
    - Protection active from moment of entry (not waiting for profit)
    - **Wider stop allows riding through normal volatility for larger gains**
  - No Take Profit: Trailing stop manages all exits for maximum upside capture
  - No Stop Loss: Trailing stop provides all downside protection
- **Smart Entry Filters:**
  - Trend strength: Requires minimum 0.1% SMA slope
  - Volatility filter: Pauses trading when volatility > 5%
- **Position Persistence:** Saves positions to disk, survives bot restarts

### Monitoring & Alerts
- **Dual-Speed Monitoring:**
  - Main analysis cycle: Every 5 minutes (finds new opportunities) - 288 checks/day
  - Position monitoring: Every 1 minute (real-time TP/SL execution) - 1,440 checks/day
- **Enhanced Telegram Notifications:**
  - Detailed trade alerts with entry price, indicators, and P&L
  - Cycle summaries with market health and buy signals
  - Heartbeat messages every 6 cycles
- **Interactive Telegram Commands:**
  - `/logs [minutes]` - Get recent logs on-demand (1-60 minutes, default 1)
  - `/status` - Get instant position snapshot with real-time P&L
  - `/sell <TOKEN>` - Manually sell an open position (e.g., `/sell JUP`)
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
1. **Market Health Index > -0.5%** - Overall crypto market not in severe bearish trend (BTC/ETH/SOL weighted on 5-minute SMA)
   - Relaxed threshold allows entries during mild market weakness (meme coins pump independently)
2. **Trend Momentum > 0.50%** - PRIMARY SIGNAL (v2.19.0: increased from 0.20%)
   - 10-period average of consecutive price variations
   - Detects sustained upward movement over 10 minutes
   - Filters out noise, false signals, and weak trends
   - **Stronger requirement = Higher quality entries**
3. **Volume Confirmation > 1.5x** - NEW in v2.19.0
   - Recent volume (last 5 periods) must be 1.5x previous average (10 periods)
   - Validates momentum with trading activity
   - Filters low-volume fake-outs
4. **RSI(14) < 70** - NEW in v2.19.0
   - Avoids overbought conditions
   - Blocks entries into exhausted moves
   - Better entry timing on strength, not exhaustion
5. **Maximum 3 Positions** - Position limit check before buying
   - First-come-first-served among 4 monitored tokens
   - Ensures capital management and buffer for fees

### Exit Conditions
- **Fixed Trailing Stop (4%) - Sole Exit Mechanism (v2.19.0: increased from 2.5%):**
  - Activates immediately on position entry (not waiting for profit)
  - Initial trailing stop: Entry price × 0.96 (-4% from entry)
  - Updates highest price every time current price exceeds previous high
  - Sells when current price drops below (highestPrice × 0.96)
  - Locks in profits while allowing unlimited upside
  - Monitored every 1 minute for accurate peak capture
  - **Example flow:**
    - Buy at $0.100 → Initial trailing at $0.096 (-4%)
    - Price rises to $0.105 → New trailing at $0.1008 (4% below $0.105)
    - Price rises to $0.120 → New trailing at $0.1152 (4% below $0.120)
    - Price drops to $0.115 → Sell triggered (below $0.1152)
    - **Result: +15% gain** (vs +7% with old 2.5% stop)
- **No Stop Loss:** Trailing stop provides all downside protection
- **No Take Profit:** Trailing stop manages all exits

### Expected Performance (v2.19.0 Optimized)
- **Win Rate:** 55-65% (improved with better filters)
- **Risk/Reward Ratio:** 3:1 to 5:1
- **Average Win:** +12% to +22% (wider stop captures larger moves)
- **Maximum Loss:** -4% (trailing stop from entry, increased from -2.5%)
- **Signals per Day:** ~2-4 (down from ~5-10, but much higher quality)
- **Expected Monthly Return:** Significantly improved with quality over quantity

## Version History

See [CHANGELOG.md](CHANGELOG.md) for detailed version history and updates.

**Current Version:** 2.19.0

### Latest Updates (v2.19.0 - Jan 29, 2026)
- **🚨 CRITICAL: Increased Trend Threshold to 0.50%** - Dramatically improved signal quality
  - Problem: Bot losing money with 0.20% threshold (too many false signals)
  - Solution: Increased to 0.50% to filter noise and require significant momentum
  - Result: Fewer but much higher-quality entries, filtering false breakouts
- **🚨 CRITICAL: Increased Trailing Stop to 4%** - Better trend riding for meme coins
  - Problem: 2.5% stop too tight, getting stopped out before moves develop
  - Solution: 4% trailing stop accommodates normal meme coin volatility
  - Result: Stay in winners longer, capture larger moves (10-20% vs 5-8%)
- **📊 Added Volume Confirmation** - Requires 1.5x volume increase to validate momentum
  - Filters low-volume fake-outs that often reverse
  - Confirms genuine moves with institutional interest
- **🛡️ Added RSI Overbought Filter** - Blocks entries when RSI(14) > 70
  - Avoids buying exhausted tops that often pullback
  - Improves entry timing and risk/reward

### Previous Updates (v2.18.0 - Jan 09, 2025)
- **🎯 Simplified to Trend-Only Momentum** - Removed spike detection for more conservative entries
- **💰 Maximum 3 Concurrent Positions** - Capital management for $1,794 USDC wallet

### Previous Updates (v2.16.0 - Dec 02, 2025)
- **🎮 Manual Trading Commands** - Full control via Telegram
  - `/buy <TOKEN>` - Manually buy any monitored token
  - `/sell <TOKEN>` - Manually sell open positions (existing)
  - `/stop` - Pause trading (positions still monitored, Telegram works)
  - `/start` - Resume trading (works because bot stays running)
  - Result: Full manual control without stopping the bot process

### Previous Updates (v2.17.0 - Dec 02, 2025)
- **⚡ Removed Golden Cross Requirement** - Momentum signals now trigger immediate buys
  - Problem: Golden cross (SMA12 > SMA26) is a lagging indicator - waits for historical averages to align
  - Example: WIF showed Spike +1.22% and Trend +0.36%, but bot waited for slow SMA crossover
  - Solution: Entry was `BUY if MH > -0.5% AND (Spike > 0.50% OR Trend > 0.20%)`
  - Result: Faster entries, better prices, catch pumps earlier (no SMA lag)
  - **Note**: Dual-momentum system (spike + trend) simplified to trend-only in v2.18.0

### Previous Updates (v2.15.0-v2.15.2 - Dec 02, 2025)
- **🎯 Dual-Momentum System** - Two independent detectors for optimal entry timing (DEPRECATED in v2.18.0)
  - **Spike Momentum (2-min)**: Caught explosive pumps > 0.50%
  - **Trend Momentum (10-min)**: Caught steady climbs > 0.20%
  - Entry logic: BUY if MH > -0.5% AND (Spike > 0.50% OR Trend > 0.20%)
  - v2.15.1: Improved trend calculation to average of 9 consecutive variations
  - v2.15.2: Fixed spike detection delay (started after 2 min, not 10 min)
  - **Removed in v2.18.0**: Simplified to trend-only momentum for better signal quality

### Previous Updates (v2.14.0 - Nov 28, 2025)
- **⚡ Immediate Momentum (2-Period)** - Simplified from 3-period averaging to 2-period immediate momentum
  - Problem: Still missing pumps despite -0.5% MH threshold
  - Root cause: 3-period averaging diluted immediate signals (Var2: +0.84% averaged to +0.46%)
  - Solution: Track only last 2 prices (T-1 → T) for immediate momentum detection
  - Expected: Catch more early-stage pumps with faster entry timing

### Previous Updates (v2.13.0 - Nov 28, 2025)
- **🚀 Lowered Market Health Threshold** - Reduced from 0.1% to -0.5% to catch meme coin pumps
  - Problem: Bot missed 4 simultaneous pumps (all had golden crosses, +2-4%)
  - Root cause: MH was slightly negative (-0.17% to -0.01%) during pumps, bot was paused
  - Solution: Now checks tokens even when BTC/ETH/SOL are slightly bearish
  - Only pauses during severe market dumps (< -0.5%)
  - Meme coins often pump independently of overall market sentiment

### Previous Updates (v2.12.4 - Nov 26, 2025)
- **📉 Lowered Momentum Threshold** - Reduced from 1.0% to 0.65% to catch more bullish trends
  - Rationale: Missing early momentum signals on tokens at 0.65%-0.99%
  - Expected: More buy signals, earlier entries, better opportunity capture
  - Monitoring: Adjustable based on performance over next 24-48 hours

### Previous Updates (v2.12.3 - Nov 26, 2025)
- **💰 Manual Sell Command** - New `/sell <TOKEN>` command for on-demand position selling
  - Usage: `/sell JUP`, `/sell WIF`, `/sell PENG`, `/sell BONK`
  - Shows pre-sell confirmation with P&L estimate
  - Full retry logic and Helius fallback support
  - Sends standard notification with actual P&L
- **🔔 Missing Notification Fix** - Guaranteed notifications even when balance checks fail
  - Fixed: Swap succeeds but 429 error prevents notification
  - Solution: Wrapped balance check in try-catch with estimated P&L fallback
  - Now always sends notification when swap succeeds
- **🔄 Balance Check Retry Logic** - Added 4-attempt retry with exponential backoff
  - Problem: `getTokenBalance()` had no error handling
  - Solution: 2s → 4s → 8s delays for rate limit errors
  - Significantly reduced RPC-related failures

### Previous Updates (v2.12.2 - Nov 26, 2025)
- **🎯 Switched to Jupiter Real-Time Prices for Momentum** - Fixed stale GeckoTerminal data issue
  - **Problem**: GeckoTerminal 1-min candles were cached, showing identical values for 3+ minutes
  - **Solution**: Switched to Jupiter real-time prices for momentum calculation
  - **New Formula**: Averaged consecutive variations instead of single T-to-T-3 comparison
    - Var1 = (T-1 - T-2) / T-2, Var2 = (T - T-1) / T-1
    - Momentum = (Var1 + Var2) / 2
  - **Result**: True real-time momentum detection every minute
  - Accurate price movements captured as they happen
  - No more false signals from stale data
  - Better entry timing during genuine pumps

### Previous Updates (v2.12.1 - Nov 26, 2025)
- **⚡ 1-Minute Token Momentum Checking** - Fixed timing inconsistency for faster entry
  - **Problem**: Using 1-min candles but checking every 5 mins missed fast pumps
  - **Solution**: Check token momentum every 1 minute when MH > 0.1
  - **New Timing**:
    - Market Health calculated/cached every 5 minutes (slow-changing indicator)
    - Token momentum checked every 1 minute (fast-changing, needs real-time detection)
  - **Result**: Catch meme coin pumps within 1 minute instead of up to 5 minutes later
  - Better entry timing during momentum spikes
  - No missed opportunities between 5-minute checks
  - Logical consistency: 1-min data checked at 1-min intervals

### Previous Updates (v2.12.0 - Nov 23, 2025)
- **🎯 Complete Strategy Overhaul** - Decoupled momentum from MH, added token-level momentum, fixed trailing stop
  - **Problem**: Momentum in MH calculation creating false signals, causing losses
  - **Solution**: Separate market health filter from token momentum detection
  - **New Entry**: Raw MH > 0.1 + Token 3-period momentum > 1% + Golden Cross
  - **New Exit**: Fixed 2.5% trailing stop (no longer dynamic)
  - **Result**: Fewer but higher quality signals, consistent exits, better profitability
  - Stricter filtering reduces whipsaw trades
  - Predictable risk management with fixed trailing stop
  - Token momentum finds genuinely hot tokens (not market-wide spikes)

### Previous Updates (v2.11.3)
- **💰 Accurate P&L Calculation** - P&L now matches Phantom wallet and Solscan exactly
  - Fixed discrepancy between bot's reported P&L and actual USDC received
  - Previous calculation was theoretical (price difference only), ignored fees and slippage
  - Now checks actual USDC balance before and after SELL operation
  - Real P&L = (USDC received from sell) - (USDC spent on buy)
  - Automatically accounts for all swap fees (~0.36% round-trip) and slippage
  - Transparent logging shows USDC balance changes

### Previous Updates (v2.11.1-v2.11.2)
- **🛡️ Helius RPC Fallback** - Backup RPC for maximum reliability during outages
  - Automatic failover when main RPC fails
  - 3-retry loop for Helius fallback (higher success rate)
  - skipPreflight optimization to prevent blockhash expiration
  - Production-grade reliability for trade execution

### Previous Updates (v2.9.0)
- **Timeframe Optimization: 1-hour → 5-minute candles** - Ultra-responsive for meme coin pumps
  - 5-minute candles with 5-minute analysis cycles (288 checks/day)
  - SMA(12) = 1 hour of data, SMA(26) = 2.2 hours of data
  - 3x faster signal detection (every 5 min vs every 15 min)
  - Catches micro-trends and pumps that 1-hour candles miss
  - More trading opportunities (2-3x increase in potential signals)
  - Earlier entries during pumps for better profit capture

### Previous Updates (v2.9.2)
- **Immediate Trailing Stop Activation** - Critical fix for instant bearish market exits
  - Trailing stop now activates immediately on position entry (not waiting for profit)
  - Fixes 4-minute delay issue when MH < 0 (was waiting for price to go positive)
  - Protection active from moment of entry, ensures 0% trailing works correctly

### Previous Updates (v2.9.1)
- **Tightened Dynamic Trailing Stop Thresholds** - More aggressive profit protection
  - Changed thresholds: MH < 0: 0% (immediate sell), 0-0.3: 0.5%, 0.3-0.6: 1.0%, 0.6-0.9: 2.25%, ≥0.9: 3.5%
  - Tighter trailing stops lock in gains faster while still giving room for strong bullish moves
  - Critical: 0% trailing at MH < 0 means immediate exit when market turns bearish

### Previous Updates (v2.8.0)
- **Dynamic Trailing Stops Based on Market Health** - Adaptive risk management
  - Trailing stop percentage now adjusts based on Market Health Index (0% to 3.5%)
  - Higher market health = wider trailing stop (lets winners run during strong bullish conditions)
  - Lower market health = tighter trailing stop (protects capital during weak/bearish conditions)
  - Expected +25-35% P&L improvement by capturing larger moves during favorable market conditions
  - /status command now shows current Market Health and dynamic trailing percentage

### Previous Updates (v2.7.3)
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
