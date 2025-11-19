# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.10.1] - 2025-11-19

### Fixed
- **🔧 Market Health Timeframe Alignment** - Critical fix to align MH calculation with bot's 5-minute analysis cycle
  - **Issue:** Bot was using hourly candles for SMA(20) calculation but running analysis every 5 minutes
    - CoinGecko API was returning 48 hourly data points (last 2 days)
    - SMA(20) represented last 20 HOURS, not last 20 analysis cycles
    - User's Binance 5-minute charts showed prices above MA(20), but bot showed negative MH
  - **Fix:** Changed `getCoingeckoHistoricalData()` to request 0.15 days (3.6 hours) instead of 2 days
    - CoinGecko returns 5-minute interval data when days <= 1
    - Now fetches ~43 data points at 5-minute intervals
    - SMA(20) now represents last 100 minutes (20 × 5-min candles), aligning with Binance 5-min charts
  - **Impact:** MH values now match user's Binance chart observations
    - More accurate market sentiment detection
    - Better alignment between bot decisions and visual chart analysis
    - 5-minute MH calculation matches 5-minute bot execution cycle
  - **Technical:** Modified `src/bot.ts:104` - Changed URL parameter from `days=2` to `days=0.15`

## [2.10.0] - 2025-11-19

### Added
- **🚀 Momentum-Based Market Health Adjustment** - Major strategy enhancement for crash avoidance and recovery capture
  - **What:** Market Health now incorporates momentum (trend of MH over recent periods) for more responsive trading decisions
  - **Period Optimization:** Backtested 2, 3, 4, 5, 6 periods to find optimal lookback window
    - **Initial:** 4 periods (20 min) - Score 51
    - **Optimal:** 2 periods (10 min) - Score 57 (11% better)
    - **Final (conservative):** 3 periods (15 min) - Score 53 (balanced approach per user preference)
  - **Why 3 periods:**
    - Balances responsiveness with stability
    - Aligns with 15-minute analysis cycle
    - Only 7% less optimal than 2, but feels safer
    - Still 4% better than original 4 periods
  - **Backtesting Results (3 periods, weight 2.0):**
    - **7 crashes prevented** (avoided buying into declining markets)
    - **32 recovery opportunities** created (earlier entries during recoveries)
    - **Accelerated sells** during downtrends (tighter stops from negative momentum)
  - **How it works:**
    1. Tracks last 3 MH values (15 minutes of history)
    2. Calculates momentum = average rate of change over 3 periods
    3. Adjusts MH: `Adjusted MH = Raw MH + (momentum × 2.0)`
    4. Uses adjusted MH for ALL decisions (buy signals, trailing stop percentages)
  - **Visibility:** Both raw and adjusted MH shown in logs and Telegram
    - Logs: `Raw=X.XX | Momentum=+X.XXX | Adjusted=X.XX`
    - Telegram: Shows both values with momentum adjustment
  - **Examples:**
    - **Death Spiral Detection:** MH = 0.10, Momentum = -0.26 → Adjusted MH = -0.16 → Blocks buy ✅
    - **Rapid Recovery:** MH = -0.5, Momentum = +0.4 → Adjusted MH = +0.3 → Allows buy ✅
    - **Stable Market:** MH = 1.5, Momentum = +0.05 → Adjusted MH = 1.6 → Minor adjustment
  - **Weight Parameter:** 2.0 (full momentum impact) based on backtesting showing best crash avoidance

### Technical Details
- Modified `src/bot.ts`:
  - Added `mhHistory` array to track last 3 MH values with timestamps
  - Added `calculateMHMomentum()` function - calculates average rate of change
  - Added `getAdjustedMarketHealth()` function - applies momentum weight to raw MH, logs both values
  - Updated main execution loop to:
    1. Store raw MH in history
    2. Calculate adjusted MH
    3. Use adjusted MH for all decisions (buy signals, trailing stops, notifications)
  - Constants: `MH_HISTORY_SIZE = 3`, `MOMENTUM_WEIGHT = 2.0`
- Modified `src/notifier/telegram.ts`:
  - Updated `AnalysisUpdate` interface to include optional `rawMarketHealth`
  - Modified `sendAnalysisSummary()` to display both raw and adjusted MH
- Backtesting script: `backtest_momentum.js` - Tests multiple period lengths (2-6) and weights (0.3-2.0)

### Impact
- **Crash Avoidance:** 45 real death spirals detected in historical data - momentum prevents buying into these
- **Recovery Capture:** 34 real rapid recoveries detected - momentum enables earlier entries
- **Tighter Risk Management:** Negative momentum tightens trailing stops (accelerates exits in downtrends)
- **Expected P&L Improvement:** Backtesting shows significant reduction in drawdown, better entry timing

## [2.9.3] - 2025-11-19

### Fixed
- **Removed Erroneous Telegram Notifications on Swap Failures** - Clean up notification spam during retries
  - **Problem:** When a swap attempt failed (e.g., "Liquidity Insufficient"), bot sent "🔴 SELL - SYSTEM" notification immediately, even though retry logic would try again
  - **User Impact:** Received confusing error notification, then immediately received successful sell notification when retry succeeded
  - **Example:** First attempt failed at 03:44:42 → Sent error notification → Second attempt succeeded at 03:44:48 → Sent success notification
  - **Fix:** Removed `sendTradeNotification()` call from `performJupiterSwap()` error handler
  - **New Behavior:**
    - Swap failures are logged but NOT notified to Telegram
    - Only send CRITICAL alert if ALL 4 attempts fail (already implemented in `executeSellOrder()`)
    - User only sees successful sell notification when retry works
  - **Expected Impact:** Cleaner Telegram notifications, less confusion, only alerts on actual problems

### Technical Details
- Modified `src/order_executor/trader.ts` line 177:
  - Removed: `sendTradeNotification({ asset: 'SYSTEM', action: 'SELL', price: 0, reason: 'Swap error...' })`
  - Added comment: "Don't send notification here - retry logic will send CRITICAL alert if all attempts fail"
- Existing CRITICAL alert logic (line 378) unchanged - still notifies if all 4 attempts fail

## [2.9.2] - 2025-11-19

### Changed
- **Immediate Trailing Stop Activation on Entry** - Critical fix to ensure 0% trailing (immediate sell) works correctly when MH < 0
  - **Problem:** Trailing stop only activated when position went into profit, causing delays when MH turned negative
  - **Example:** MH = -0.03 at 08:05:54, but PENG not sold until 08:09:18 (4-minute delay waiting for price to go positive)
  - **Solution:** Trailing stop now activates immediately upon position entry, not when price goes positive
  - **New Behavior:**
    - BUY executed → Trailing stop activated immediately at entry price
    - Initial trailing percentage based on current Market Health at entry
    - If MH < 0 after entry → Immediate sell on next position check (no waiting for profit)
    - Protection active from the moment of entry
  - **Benefits:**
    - Immediate sell when MH < 0 works correctly (no 4-minute delays)
    - Position protected from moment of entry, not after going into profit
    - More logical and safer risk management
  - **Expected Impact:** Faster exits when market turns bearish, better capital preservation

### Technical Details
- Modified `src/order_executor/trader.ts`:
  - Added imports: `getLatestMarketHealth`, `getDynamicTrailingStop` from `bot.ts`
  - Position creation now sets: `trailingStopActive: true`, `highestPrice: entryPrice`
  - Logs trailing activation: "🔒 Trailing stop activated immediately for {ASSET} at entry"
- Modified `src/bot.ts`:
  - Removed conditional trailing activation logic (`if (currentPrice > position.entryPrice && !position.trailingStopActive)`)
  - Added fallback activation for positions loaded from disk
  - Simplified position monitoring logic

## [2.9.1] - 2025-11-17

### Changed
- **Tightened Dynamic Trailing Stop Thresholds** - More aggressive profit protection to reduce drawdowns in volatile meme coin markets
  - **Before:** MH < 0: 1.5%, MH 0-0.3: 2.0%, MH 0.3-0.6: 2.5%, MH 0.6-0.9: 3.0%, MH ≥0.9: 3.5%
  - **After:** MH < 0: 0% (immediate sell), MH 0-0.3: 0.5%, MH 0.3-0.6: 1.0%, MH 0.6-0.9: 2.25%, MH ≥0.9: 3.5%
  - **Rationale:** Previous thresholds were too loose, allowing profits to evaporate during sudden reversals. Tighter trailing stops lock in gains faster while still giving room for strong bullish moves (3.5% at MH ≥0.9)
  - **Expected Impact:** Reduced profit giveback, better capital preservation during market uncertainty
  - **Critical Change:** 0% trailing at MH < 0 means immediate exit when market turns bearish (no waiting for further decline)

### Technical Details
- Modified `getDynamicTrailingStop()` function in `src/bot.ts`:
  - MH < 0: `0.015` → `0.00` (immediate sell)
  - MH 0-0.3: `0.02` → `0.005` (0.5%)
  - MH 0.3-0.6: `0.025` → `0.01` (1.0%)
  - MH 0.6-0.9: `0.03` → `0.0225` (2.25%)
  - MH ≥0.9: `0.035` (unchanged, 3.5%)

## [2.9.0] - 2025-11-17

### Changed
- **Timeframe Optimization: 1-hour → 5-minute candles** - Ultra-responsive strategy for meme coin pumps
  - **Before:** 1-hour candles, 15-minute analysis cycle (96 checks/day)
  - **After:** 5-minute candles, 5-minute analysis cycle (288 checks/day)
  - **SMA Periods Adjusted:**
    - SMA(12) on 5-min candles = 1 hour of price data (vs 12 hours on 1h candles)
    - SMA(26) on 5-min candles = 2.2 hours of price data (vs 26 hours on 1h candles)
  - **Rationale:** Meme coins can pump and dump in minutes; 1-hour candles were too slow to catch micro-trends
  - **Expected Impact:**
    - 3x faster signal detection (every 5 min vs every 15 min)
    - Catches Golden Cross signals within 5 minutes of occurrence
    - More trading opportunities (potential 2-3x increase in signals)
    - Earlier entries during pumps (capturing more of initial move)
  - **Trade-offs:**
    - More signals = more trades (may increase false positives)
    - Need to monitor performance closely to validate strategy effectiveness
  - **API Impact:** Analysis calls increase from 480/day to 1,440/day (still well within GeckoTerminal's 43,200/day limit)
  - **Market Health:** Also updated to 5-minute timeframe for consistency

### Technical Details
- Modified `strategyConfig.timeframe` from `'1h'` to `'5m'` in `src/config.ts`
- Modified `marketFilterConfig.timeframe` from `'1h'` to `'5m'` in `src/config.ts`
- Changed `BOT_EXECUTION_INTERVAL` from `15 * 60 * 1000` to `5 * 60 * 1000` (5 minutes)
- Updated comments to reflect SMA periods in actual time (1 hour and 2.2 hours)

## [2.8.0] - 2025-11-17

### Added
- **Dynamic Trailing Stops Based on Market Health** - Adaptive risk management that adjusts to market conditions
  - **Core Logic:** Trailing stop percentage now varies with Market Health Index instead of fixed 1%
  - **Thresholds:**
    - MH < 0 (Bearish): 1.5% trailing - Tight protection in downtrends
    - MH 0-0.3 (Weak Bullish): 2.0% trailing - Moderate room for small moves
    - MH 0.3-0.6 (Moderate Bullish): 2.5% trailing - Good room for typical moves
    - MH 0.6-0.9 (Strong Bullish): 3.0% trailing - Ample room for large moves
    - MH ≥ 0.9 (Very Strong Bullish): 3.5% trailing - Maximum room for explosive moves
  - **Rationale:** Higher market health correlates with larger price moves before reversal. Fixed 1% trailing was exiting at +0.5-1% gains while missing +3-5% moves during strong bullish conditions
  - **Expected Impact:** Based on data analysis, projected +25-35% P&L improvement by letting winners run during favorable market conditions
  - **Visibility:** Logs now show current trailing percentage and Market Health value for transparency
  - **Telegram /status:** Now displays Market Health Index and dynamic trailing percentage for each position

### Technical Details
- New function: `getDynamicTrailingStop()` in `src/bot.ts` - Calculates trailing % based on market health
- New function: `getLatestMarketHealth()` in `src/bot.ts` - Getter for current market health (used by command handlers)
- Module-level variable: `latestMarketHealth` - Stores latest market health for use in position monitoring loop
- Modified: Trailing stop calculation in position monitoring (line ~180) - Now uses dynamic percentage
- Modified: `getPositionsStatus()` in `src/notifier/commandHandler.ts` - Shows market health and dynamic trailing %
- Log format updated: `[Trailing]` line now includes `(X.X% trail @ MH=X.XX)` for debugging

## [2.7.3] - 2025-11-17

### Removed
- **JTO removed from monitored assets** - User-driven optimization based on performance data
  - **Reason:** JTO identified as least effective and too volatile, causing losses
  - **Result:** Bot now monitors 4 assets instead of 5 (JUP, WIF, PENG, BONK)
  - **Existing positions:** Open JTO positions will continue to be monitored until exit
  - **Impact:** More focused portfolio, reduced exposure to underperforming asset

## [2.7.2] - 2025-11-13

### Changed
- **Improved Log Clarity** - Cleaner, less redundant analysis logs
  - Removed `[STATE]` line with truncated asset address and duplicate SMA/RSI values
  - Reordered logs: Asset name now appears first (not after technical data)
  - Golden Cross message only appears when transition actually occurs
  - Eliminated "Previous: BEARISH | Current: BEARISH" redundancy
  - **Before:** 4 lines with duplicate data and confusing order
  - **After:** 3 lines in logical order (Asset → Golden Cross if any → Technical Data → Decision)

### Fixed
- **Race Condition in Sell Orders** - Prevented duplicate sells from concurrent loops
  - Fixed bug where position monitor loop and main analysis cycle could both trigger sell
  - Added position existence check before executing sell orders
  - Prevents delayed retries from selling wrong positions after new buy
  - Ghost positions from failed sells now properly handled

## [2.7.1] - 2025-11-12

### Changed
- **Stop Loss Tightened: 3% → 1%** - Consistent risk management with trailing stop
  - **Before:** -3% stop loss, -1% trailing stop (inconsistent)
  - **After:** -1% stop loss, -1% trailing stop (consistent)
  - **Rationale:** If -1% trailing is optimal for protecting profits, -1% stop loss should be optimal for limiting losses
  - **Trade-off:** Tighter stop may increase false stops, but provides consistent risk management
  - Average loss reduced from -3% to -1%

## [2.7.0] - 2025-11-12

### Changed
- **Analysis Cycle Frequency: 60 min → 15 min** - More dynamic buy detection (4x faster)
  - **Before:** 1 hour cycles = 24 checks/day
  - **After:** 15 minute cycles = 96 checks/day
  - **Benefit:** Catches Golden Cross signals within 15 minutes instead of waiting up to 1 hour
  - **Rationale:** Meme coins can move fast, faster entry timing improves profit capture
  - Position monitoring unchanged: Still every 1 minute for accurate trailing stop execution

## [2.6.0] - 2025-11-12

### Changed
- **Trailing Stop Tightened: 3% → 1%** - Data-driven optimization for meme coin volatility
  - **Analysis of last 24h:** 3 sells showed 3% trailing is too wide
  - **Results with 3%:** -2.54% total (2 losses, 1 small win)
  - **Results with 1%:** +3.91% total (improvement of +6.45%)
  - **Reason:** Meme coins make small moves (1-3%), 3% trailing loses all gains before exit
  - **With 1-min monitoring:** 1% is sufficient to avoid noise while capturing profits
  - Example: Entry $0.100, highest $0.103 (+3%) → Trail at $0.10197 locks +1.97% profit

## [2.5.0] - 2025-11-12

### Changed
- **Immediate Trailing Stop Activation** - Trailing stop now activates as soon as price > entry (any profit)
  - **Before:** Waited for +1% profit before activating trailing stop
  - **After:** Activates immediately when `currentPrice > entryPrice`
  - **Benefit:** Even small profits (0.1%-0.9%) now get protected with trailing stop
  - **Logic consistency:** Same behavior for activation and updates (any new high)
  - Example: Buy at $0.100, price hits $0.1003 (+0.3%) → Trailing active at $0.0973
- **Polished Position Monitoring Logs** - Cleaner, more actionable position information
  - **[Trailing Stop] line:** Removed redundant "Current" price, added potential P&L if trailing stop is hit
  - **[Targets] line:** Removed dollar amounts, kept only distance percentages
  - Shows immediate risk/reward: current P&L vs protected P&L at trailing stop
  - Example: `[Trailing Stop] JUP: Trail Stop=$0.339650, P&L=-2.34% ($-11.72), Highest=$0.350155`
- **Updated [Targets] log** - For positions without trailing, now shows "Breakeven" instead of "Trailing activation"

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
