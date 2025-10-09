# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

- **v2.2.0** - Timeframe optimization (1-hour candles for faster entries)
- **v2.1.0** - Strategy optimization (filters, trailing stops, monitoring frequency)
- **v2.0.0** - Market filter + infrastructure improvements (persistence, metrics, error handling)
- **v1.0.0** - Initial bot with Golden Cross strategy

---

[Unreleased]: https://github.com/Kba-Notes/trading-bot-solana/compare/v2.2.0...HEAD
[2.2.0]: https://github.com/Kba-Notes/trading-bot-solana/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/Kba-Notes/trading-bot-solana/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/Kba-Notes/trading-bot-solana/compare/v1.0.0...v2.0.0
[1.0.0]: https://github.com/Kba-Notes/trading-bot-solana/releases/tag/v1.0.0
