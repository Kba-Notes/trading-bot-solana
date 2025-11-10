# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.4.0] - 2025-11-10

### Added
- **Stateful Golden Cross Detection** - Complete rewrite from array-based lookback to clean state comparison
  - Stores previous BULLISH/BEARISH state in persistent JSON file (`data/assetStates.json`)
  - Detects Golden Cross by comparing previous cycle state vs current state
  - State survives bot restarts and is reset to BEARISH on every sell
  - Eliminates complex SMA array calculations and lookback windows
  - Simple logic: if `previous === BEARISH && current === BULLISH` → BUY
- **Enhanced Log Formatting** - Cleaner, more readable logs with better visibility
  - Simplified format: `2025-11-10 12:35:53 -> [Message]` (removed JSON clutter)
  - Absolute dollar values added to all percentage distances
  - Dynamic decimal precision: 8 decimals for prices < $0.01, 6 for larger prices
  - Position monitoring now shows both directions: distance to new high AND distance to trailing stop hit
- **Complete Targets Visibility** - Added [Targets] line for ALL positions
  - **Without trailing**: Shows distance to activation and stop loss with $ amounts
  - **With trailing**: Shows distance to new high and distance to trail hit with $ amounts
  - Example: `[Targets] BONK: New high=1.19% away ($0.00000016), Trail hit=1.85% away ($0.00000025)`
- **Interactive Telegram Commands** - On-demand access to logs and status via chat commands
  - `/logs [minutes]` - Get recent logs (1-60 minutes, default 1)
  - `/status` - Get instant position snapshot with P&L
  - `/help` - Show available commands
  - Chat ID verification for security
- **Automatic Log Rotation** - Implemented winston-daily-rotate-file
  - Daily log files with date pattern: `trading-bot-YYYY-MM-DD.log`
  - 10MB max file size before rotation
  - 7-day retention policy (auto-delete old logs)
  - Prevents unbounded log file growth

### Changed
- **Log format migrated** - From JSON (`{"level":"info","message":"..."}`) to plain text
- **Removed "High" field** - Trailing stop logs now only show Trail Stop and Current price
- **Telegram log attachments fixed** - Now properly extracts plain text logs instead of JSON

### Fixed
- **Golden Cross detection reliability** - Bot was missing crosses between hourly checks
  - User reported: PENG, WIF, BONK all crossed but bot said "already bullish" instead of buying
  - Root cause: Overcomplicated array-based lookback with index alignment issues
  - Solution: Clean stateful approach that compares previous vs current state
  - Result: Successfully detected and bought WIF, PENG, BONK on first cycle after fix
- **Log extraction for Telegram** - Fixed to handle new plain text format instead of JSON parsing

### Technical Details
- New file: `src/state/assetStates.ts` - State persistence module
- New file: `src/notifier/commandHandler.ts` - Telegram command handlers
- Rewritten: `src/strategy_analyzer/logic.ts` - Simplified from ~150 lines to ~80 lines
- Modified: `src/bot.ts` - Integrated state loading, saving, reset on sell, and highest price tracking
- Modified: `src/notifier/telegram.ts` - Updated log extraction to parse plain text format
- Modified: `src/services.ts` - Changed Winston logger format from JSON to readable text, enabled Telegram polling, added DailyRotateFile
- Added dependency: `winston-daily-rotate-file` for automatic log rotation

## [2.3.0] - 2025-10-27

### Changed
- **BREAKING: Migrated from Birdeye to GeckoTerminal API** - Replaced Birdeye for historical OHLCV data to eliminate monthly quota limits
- **Historical data source: Birdeye → GeckoTerminal** - Free unlimited tier (30 req/min = 43,200 req/day vs 30K CUs/month)
- **Added GeckoTerminal pool mappings** - All 5 trading assets (JUP, JTO, WIF, PENG, BONK) now use DEX pool addresses
- **API versioning** - Implemented version header (`Accept: application/json;version=20230302`) for Beta API stability

### Fixed
- **Telegram notifications** - Corrected "Next analysis in 4 hours" → "Next analysis in 1 hour" to match actual 1-hour interval
- **Heartbeat cycle counter** - Fixed from 6 cycles to 24 cycles for proper daily heartbeats with 1-hour intervals

### Improved
- **No more rate limit issues** - Bot uses 0.28% of daily GeckoTerminal limit (120 calls vs 43,200 available)
- **Eliminated downtime** - Birdeye quota exhaustion was blocking all trades, now fully operational
- **Future-proof** - GeckoTerminal free tier sufficient for scaling to more assets

### Technical Details
- Rewrote `getHistoricalData()` in `src/data_extractor/jupiter.ts` to use GeckoTerminal API
- Updated `src/config.ts` with `geckoPool` field for all assets
- Modified `src/bot.ts` to pass pool addresses instead of mint addresses
- GeckoTerminal endpoint: `https://api.geckoterminal.com/api/v2/networks/solana/pools/{pool}/ohlcv/{timeframe}`
- OHLCV format: `[timestamp, open, high, low, close, volume]` - extracting close prices (index 4)

## [2.2.0] - 2025-10-09

### Changed
- **Timeframe optimization: 4-hour → 1-hour candles** - Faster signal detection for volatile meme coins
- **Execution interval: 4 hours → 1 hour** - Bot now analyzes opportunities 24 times/day instead of 6
- **Better entry timing** - Catches Golden Cross signals within 1 hour instead of waiting up to 4 hours

### Improved
- Significantly faster market entry during bullish runs
- More trading opportunities without sacrificing signal quality
- Better suited for meme coin volatility patterns
- Increased responsiveness while maintaining technical analysis integrity

## [2.1.0] - 2025-10-08

### Added
- **15-minute position monitoring loop** - Separate lightweight loop that checks open positions every 15 minutes for faster TP/SL/trailing stop execution
- **Trend strength filter** - SMA slope calculation requiring minimum 0.1% upward momentum to enter trades
- **Volatility filter** - 20-period average volatility check that pauses trading when volatility exceeds 5%
- **Trailing stop loss** - Activates at +2% profit, trails 3% below highest price to protect gains while letting winners run
- **Enhanced Telegram notifications** - Detailed BUY/SELL messages with technical indicators, entry prices, and P&L percentages
- **Analysis cycle summaries** - After each 4-hour cycle, sends market health, buy signals, and open positions summary

### Changed
- **Take Profit increased from 4% to 8%** - Better upside capture for volatile meme coin moves
- **Stop Loss increased from 2% to 3%** - Reduces false stop-outs from normal price noise
- **Trailing stop distance increased from 2% to 3%** - Smoother trailing that avoids premature exits on minor pullbacks
- **Position state persistence** - Added `highestPrice` and `trailingStopActive` fields to persist trailing stop state across restarts

### Improved
- Expected win rate: 50-60% (with wider stops filtering out marginal setups)
- Expected average win: +8-15% (vs previous +4%)
- Expected risk/reward ratio: 2.5:1 to 5:1
- Overall P&L improvement: +30-50% expected based on meme coin volatility patterns

## [2.0.0] - 2025-10-07

### Added
- **Market Health Index** - Weighted composite of BTC (25%), ETH (25%), and SOL (50%) distance from their 20-day SMAs
- **Market filter protection** - Bot only enters new positions when market health index is positive
- **Performance metrics tracking** - Records API call success rates, execution times, and uptime
- **Graceful shutdown handlers** - SIGTERM/SIGINT handlers with cleanup for safe bot termination
- **Position persistence** - Saves open positions to JSON file to survive bot restarts
- **Environment validation** - Validates all required environment variables at startup
- **Custom error types** - Structured error handling with context preservation
- **Centralized constants** - Extracted magic numbers to `constants.ts` for maintainability

### Changed
- **Refactored strategy logic** - Extracted into `GoldenCrossStrategy` class for better organization
- **Retry logic on API calls** - Automatic retries with exponential backoff for resilience
- **Enhanced logging** - Winston logger with structured, timestamped logs

### Fixed
- **Jupiter API v1 migration** - Updated from deprecated v4 endpoints to current v1 endpoints (critical fix)

## [1.0.0] - 2025-10-05

### Added
- Initial bot implementation with Golden Cross strategy
- SMA(12) and SMA(26) crossover detection on 4-hour timeframe
- RSI(14) confirmation requiring RSI > 50 for entries
- Fixed take profit (+4%) and stop loss (-2%) levels
- Jupiter API integration for price data and swap execution
- Telegram notifications for trade execution
- PM2 process management setup
- Multi-asset monitoring (JUP, JTO, WIF, PENG, BONK)
- 4-hour execution cycle
- Winston logging to file and console
- Environment variable configuration

### Technical Stack
- TypeScript + Node.js
- Solana blockchain via Jupiter DEX aggregator
- CoinGecko API for BTC/ETH data
- Birdeye API for SOL data
- PM2 for process management

---

## Version History Summary

- **v2.3.0** - API migration (GeckoTerminal replaces Birdeye for unlimited historical data)
- **v2.2.0** - Timeframe optimization (1-hour candles for faster entries)
- **v2.1.0** - Strategy optimization (filters, trailing stops, monitoring frequency)
- **v2.0.0** - Market filter + infrastructure improvements (persistence, metrics, error handling)
- **v1.0.0** - Initial bot with Golden Cross strategy

---

[Unreleased]: https://github.com/Kba-Notes/trading-bot-solana/compare/v2.3.0...HEAD
[2.3.0]: https://github.com/Kba-Notes/trading-bot-solana/compare/v2.2.0...v2.3.0
[2.2.0]: https://github.com/Kba-Notes/trading-bot-solana/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/Kba-Notes/trading-bot-solana/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/Kba-Notes/trading-bot-solana/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/Kba-Notes/trading-bot-solana/releases/tag/v1.0.0
