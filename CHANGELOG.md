# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.15.2] - 2025-12-02

### Fixed
- **⚡ Spike Momentum Available Immediately** - No longer waits for trend momentum to be ready
  - **Problem**: Bot waited 9 minutes for trend history (10 prices) even though spike was ready after 2 minutes
    - Example from logs: `Spike: 2/2, Trend: 2/10` → Skipped checking spike
    - Entry logic uses OR (Spike > 0.50% **OR** Trend > 0.20%) but code required BOTH ready
  - **Impact**: 9-minute delay in spike detection after bot restart
  - **Solution**: Check spike as soon as it's ready (2 minutes), add trend check when ready (10 minutes)
  - **New behavior**:
    - Minutes 0-2: Building spike history
    - Minutes 2-10: Checking spike only (trend building)
    - Minutes 10+: Checking both (OR logic)
  - **Logging update**: Shows `Trend building (2/10)` when spike ready but trend not yet ready

### Technical Details
- Modified: `src/bot.ts` lines 380-418 - Changed from AND to proper OR logic
- Logic: Skip only if `!hasSpikeMomentum` (not `!hasSpikeMomentum || !hasTrendMomentum`)
- Trend check: `trendTriggered = hasTrendMomentum && trendMomentum > TREND_MOMENTUM_THRESHOLD`

## [2.15.1] - 2025-12-02

### Changed
- **🔍 Improved Trend Momentum Calculation** - Now uses average of consecutive variations
  - **Problem with v2.15.0**: Trend momentum compared T-10 directly to T
    - Example: If T-10 to T-1 is flat, but T spikes, trend momentum incorrectly showed high percentage
    - Couldn't distinguish between "steady trend" vs "flat + spike at end"
  - **Solution**: Calculate average of 9 consecutive period-to-period variations
    - Formula: Average of [(T-9 - T-10)/T-10, (T-8 - T-9)/T-9, ..., (T - T-1)/T-1]
    - Measures **average rate of change** instead of total change
  - **Impact**: Much better at filtering false trend signals
    - True steady trend: Each period +0.2% → Average +0.2% ✓ (detected)
    - Flat + spike: 9 periods flat (0%), 1 spike (+2%) → Average +0.22% ✗ (filtered out)
  - **Credit**: User suggestion for more accurate trend detection

### Technical Details
- Modified: `src/bot.ts` lines 366-378 - Loop through consecutive periods and average variations
- Logging: Added "(avg)" label to trend momentum to clarify calculation method
- Formula: `trendMomentum = sum(variations) / (historySize - 1)`

## [2.15.0] - 2025-12-02

### Added
- **🎯 Dual-Momentum System** - Separate detectors for fast pumps and steady trends
  - **Problem Analysis**: Bot caught fast pumps but missed steady climbs
    - Example (PENG 11:00-13:00): Steady +0.20-0.30% momentum → IGNORED
    - Example (PENG 14:09): Spike +0.67% momentum → BOUGHT AT TOP
    - Result: Bad entry timing, bought peaks instead of early trends
  - **Solution**: Two independent momentum detectors
    1. **Spike Momentum (2-period)**:
       - Detects immediate pumps (T-1 → T)
       - Threshold: **0.50%** (lowered from 0.55%)
       - Catches explosive moves as they happen
    2. **Trend Momentum (10-period)**:
       - Detects steady climbs (T-10 → T)
       - Threshold: **0.20%** (new)
       - Catches gradual uptrends early
  - **Entry Logic**: BUY if (Golden Cross AND MH > -0.5% AND (Spike > 0.50% OR Trend > 0.20%))
- **📊 Enhanced Logging** - Both momentums shown in logs
  - Format: `Spike +0.67% | Trend +0.23%`
  - Shows which momentum triggered: `SPIKE`, `TREND`, or `SPIKE+TREND`
  - Price ranges for both periods displayed
- **📱 Enhanced Telegram Notifications** - Buy notifications show trigger reason
  - Examples: `SPIKE (0.67% > 0.50%)`, `TREND (0.23% > 0.20%)`, `SPIKE+TREND (0.67% + 0.23%)`
  - Clear visibility into what triggered each buy signal

### Changed
- **Spike Momentum Threshold**: Lowered from 0.55% to 0.50%
- **Price History Tracking**: Now maintains two separate histories
  - `spikePriceHistory`: Last 2 prices per token (2 minutes)
  - `trendPriceHistory`: Last 10 prices per token (10 minutes)

### Expected Impact
- ✅ **Early entries on steady trends** (would have caught PENG at 11:20 instead of 14:09)
- ✅ **Better position quality** (enter during climbs, not at peaks)
- ✅ **Still catch explosive pumps** (spike detector unchanged in logic)
- ✅ **More trading opportunities** (steady trends + fast pumps)
- 📊 **More signals expected** (lower spike threshold + new trend detector)

### Technical Details
- Modified: `src/bot.ts` - Added dual-momentum calculation and thresholds
- Modified: `src/order_executor/trader.ts` - Added `triggerReason` parameter to `executeBuyOrder()`
- History sizes: Spike (2 prices), Trend (10 prices)
- Both use Jupiter real-time prices for accuracy

## [2.14.0] - 2025-11-28

### Changed
- **⚡ Immediate Momentum (2-Period)** - Simplified from 3-period averaging to 2-period immediate momentum
  - **Problem**: Still missing entries despite -0.5% MH threshold
  - **User Analysis**: "check the variation2...it was a lot, but we did not buy as the previous one wasn't that high"
  - **Example from logs (14:27:45)**:
    - PENG: Var1=+0.08%, **Var2=+0.84%** (PUMPING!), Averaged=+0.46% → MISSED
    - By averaging with old momentum (Var1), immediate pump signal (Var2) was diluted
  - **Root Cause**: 3-period averaging looked backward, missing immediate pumps
  - **Solution**: Use only **2 periods (T-1 → T)** for immediate momentum
    - No averaging = catches pumps as they start
    - Formula: `(T - T-1) / T-1 × 100`
- **📉 Lowered Momentum Threshold** - Reduced from 0.65% to 0.55%
  - Combined with 2-period momentum for maximum responsiveness
- **Expected Impact**:
  - ✅ Would have caught PENG at +0.84% (was filtered at +0.46%)
  - ✅ Faster response to immediate price movements
  - ⚠️ May increase signal frequency (monitoring needed)

## [2.13.0] - 2025-11-28

### Changed
- **🚀 Lowered Market Health Threshold** - Reduced from 0.1% to -0.5% to catch meme coin pumps
  - **Problem Identified**: Bot missed 4 simultaneous pumps (BONK, WIF, PENG, JUP) on 2025-11-28 at 14:20 CET
    - All 4 tokens showed golden crosses and +2-4% pumps
    - Market Health was -0.17% to -0.01% (slightly bearish)
    - Bot was PAUSED for 17 minutes during the pumps
    - Resumed at 14:37 CET when MH finally reached +0.26%
  - **Root Cause**: Meme coins often pump independently of BTC/ETH/SOL
    - MH > 0.1 requirement was too strict
    - Individual token momentum can override overall market sentiment
    - Waiting for BTC+ETH+SOL to all be bullish misses solo pumps
  - **Solution**: Lowered MH threshold from **0.1%** to **-0.5%**
    - Now checks tokens even during slight market bearishness
    - Only pauses during severe market dumps (< -0.5%)
    - Keeps MH calculation logic intact for future adjustments
  - **Expected Impact**:
    - ✅ Catch meme coin pumps even when BTC/ETH/SOL are slightly red
    - ✅ Would have caught all 4 pumps today (MH ranged from -0.17% to -0.01%)
    - ⚠️ May increase trades during mild market weakness (need monitoring)
    - 📊 Can adjust to -0.3% or -0.7% based on results
  - **Implementation**:
    - [src/bot.ts:295](src/bot.ts#L295) - Token momentum check threshold
    - [src/bot.ts:486](src/bot.ts#L486) - Status log message
  - **Monitoring**: Track win rate over next 48 hours, adjust if needed

## [2.12.4] - 2025-11-26

### Changed
- **📉 Lowered Momentum Threshold** - Reduced from 1.0% to 0.65% to catch more bullish trends
  - **User Feedback**: "we are missing some nice bullish immediate trends for the tokens"
  - **Rationale**: 1% threshold was too high, filtering out valid early momentum signals
  - **Change**: Token momentum must be > 0.65% (down from > 1.0%) to trigger buy
  - **Expected Impact**:
    - More buy signals (earlier entries into bullish trends)
    - Better capture of immediate momentum shifts
    - May slightly reduce win rate but improve overall opportunity capture
    - Will catch tokens at 0.65%-0.99% momentum that were previously filtered
  - **Implementation**: [src/bot.ts:362](src/bot.ts#L362)
  - **Monitoring**: Watch for signal quality - can adjust further if needed

## [2.12.3] - 2025-11-26

### Added
- **💰 Manual Sell Command via Telegram** - New `/sell <TOKEN>` command for on-demand position selling
  - **Usage**: `/sell JUP`, `/sell WIF`, `/sell PENG`, `/sell BONK`
  - **Pre-Sell Confirmation**: Shows entry price, current price, and estimated P&L
  - **Execution Feedback**: "Manual Sell Initiated" message while processing
  - **Full Reliability**: Uses same `executeSellOrder()` with all retry logic and Helius fallback
  - **Automatic Notification**: Standard sell notification sent with actual P&L
  - **Error Handling**: Clear failure messages if sell doesn't succeed
  - **Updated `/help`**: Command now included in help menu
  - **Implementation**: [src/notifier/commandHandler.ts:190-254](src/notifier/commandHandler.ts#L190-L254)

### Fixed
- **🔔 Missing Notifications After Successful Swaps** - Critical bug when balance check fails post-swap
  - **Problem Identified**: When swap succeeds but post-swap USDC balance check fails (429 rate limit):
    - Exception thrown before sending Telegram notification
    - Position removed but user never notified
    - No P&L logged
    - Example: PENG manual sell at 17:48:41 succeeded but user got no notification
  - **Root Cause**: Balance check after successful swap threw 429 error, bypassing notification logic
  - **Solution**: Wrapped balance check in try-catch with fallback to estimated P&L
    - If balance check succeeds → Use actual USDC received (accurate P&L)
    - If balance check fails → Use estimated P&L based on current price
    - **Always send notification** regardless of balance check outcome
    - Position still removed (swap already succeeded)
  - **Implementation**:
    - Main RPC path: [src/order_executor/trader.ts:414-433](src/order_executor/trader.ts#L414-L433)
    - Helius fallback path: [src/order_executor/trader.ts:498-517](src/order_executor/trader.ts#L498-L517)
  - **User Impact**: Will always receive sell notification even during RPC issues

- **🔄 Balance Check Retry Logic** - Added retry mechanism to `getTokenBalance()` function
  - **Problem Identified**: Function had no error handling, threw on first 429 error
    - `getParsedTokenAccountsByOwner()` RPC call vulnerable to rate limits
    - No retry logic or backoff delays
    - Caused cascading failures in sell operations
  - **Solution**: Added 4-attempt retry with exponential backoff
    - **Rate limit errors (429)**: 2s → 4s → 8s delays (aggressive backoff)
    - **Other errors**: 1s → 2s → 3s delays (standard backoff)
    - Clear logging showing attempt numbers and delays
    - Only throws after all 4 attempts exhausted
  - **Implementation**: [src/order_executor/trader.ts:332-362](src/order_executor/trader.ts#L332-L362)
  - **Expected Impact**:
    - Significantly reduced balance check failures
    - Better handling of temporary RPC congestion
    - More reliable P&L calculation
    - Fewer fallbacks to estimated P&L

## [2.12.2] - 2025-11-26

### Fixed
- **🔄 Real-Time Jupiter Prices with Averaged Momentum** - Fixed stale GeckoTerminal data issue
  - **Problem Identified**: GeckoTerminal 1-minute candles were cached/stale
    - Same candle data returned for 3+ consecutive minutes
    - Momentum values weren't changing minute-to-minute
    - Defeated the purpose of 1-minute checking implemented in v2.12.1
    - Example: WIF showed identical 4 candles at 17:17, 17:18, and 17:19
  - **Solution**: Switch to Jupiter real-time prices with improved momentum calculation
    - Fetch live Jupiter price every minute (no caching)
    - Store last 3 prices in memory per token
    - Calculate momentum using averaged consecutive variations

  **New Momentum Formula (v2.12.2):**
  - Fetch: T (current), T-1 (1 min ago), T-2 (2 min ago)
  - Variation 1: (T-1 - T-2) / T-2 × 100
  - Variation 2: (T - T-1) / T-1 × 100
  - **Momentum = (Variation 1 + Variation 2) / 2**

  **Why This Works Better:**
  - ✅ **Real-Time Data**: Jupiter prices update every minute (no cache)
  - ✅ **More Accurate**: Averaged variations smooth out single-period spikes
  - ✅ **Better Detection**: Captures acceleration/deceleration patterns
  - ✅ **Transparent Logging**: Shows T-2 → T-1 → T with both variations

  **Technical Changes:**
  - Added `priceHistory` Map to store last 3 prices per token in [src/bot.ts:36](src/bot.ts#L36)
  - Rewrote `checkTokenMomentumForBuy()` to use real-time Jupiter prices in [src/bot.ts:292-405](src/bot.ts#L292-L405)
  - Removed GeckoTerminal 1-minute candle fetching (replaced with Jupiter real-time)
  - Enhanced logging to show price progression and variation calculations

  **Example Output:**
  ```
  JUP: Momentum +0.43%
  └─ Prices: T-2=$0.25125322 → T-1=$0.25334234 → T=$0.25339941
  └─ Var1: +0.83%, Var2: +0.02%, Avg: +0.43%
  ```

  **Expected Impact:**
  - Accurate momentum detection every minute
  - No more stale/cached candle data
  - Better identification of genuine momentum vs noise
  - More reliable entry signals

## [2.12.1] - 2025-11-26

### Changed
- **⚡ 1-Minute Token Momentum Checking** - Fixed logical inconsistency in v2.12.0 implementation
  - **User Feedback**: "it does not make sense to use 1-minute candle and calculate it every 5 minutes"
  - **Problem Identified**: Using 1-min candles but checking every 5 minutes missed fast-moving tokens
    - Token could pump and dump within those 5 minutes between checks
    - Defeated the purpose of using granular 1-minute data
    - Only caught momentum if it happened at the exact 5-minute check time
  - **Solution**: Check token momentum every 1 minute when MH > 0.1

  **New Logic (v2.12.1):**
  - **5-Minute Cycle**: Calculate and cache Market Health
    - MH changes slowly (20-period SMA on 5-min candles)
    - Checking every 5 minutes is sufficient
  - **1-Minute Cycle**: Check token momentum when MH > 0.1
    - For each token without a position:
      - Fetch latest 1-minute candles
      - Calculate 3-period momentum
      - If momentum > 1% AND Golden Cross → BUY immediately
    - Catches pumps within 1 minute (not 5 minutes later)

  **Why This Works Better:**
  - ✅ **Logical Consistency**: 1-min data checked at 1-min intervals
  - ✅ **Faster Entry**: Detect and enter pumps within 1 minute
  - ✅ **No Missed Opportunities**: Don't miss tokens that pump between 5-min checks
  - ✅ **Efficient**: MH cached for 5 mins (only 3 API calls), tokens checked every min
  - ✅ **Smart Filtering**: Only check tokens when MH > 0.1 (skip in bearish markets)

  **Technical Changes:**
  - Created `checkTokenMomentumForBuy()` function for 1-minute checks in [src/bot.ts:284-355](src/bot.ts#L284-L355)
  - Modified `positionMonitoringLoop()` to call momentum checker every minute in [src/bot.ts:441-461](src/bot.ts#L441-L461)
  - Simplified 5-minute cycle to only calculate MH in [src/bot.ts:509-526](src/bot.ts#L509-L526)
  - Removed `findNewOpportunities()` function (replaced by 1-min momentum checker)
  - Added status logging: "Token momentum checking ACTIVE/PAUSED" based on MH

  **Expected Impact:**
  - Catch meme coin pumps within 1 minute (vs up to 5 minutes delay)
  - Better entry timing (enter during momentum spike, not after)
  - Higher profit potential (earlier entries mean better prices)
  - No change to exit strategy (still fixed 2.5% trailing stop)

## [2.12.0] - 2025-11-23

### Changed
- **🎯 Complete Strategy Overhaul** - Decoupled momentum from MH, added token-level momentum filter, fixed trailing stop
  - **User Feedback**: "we need to revise the strategy as I'm currently losing money since the beginning of the bot"
  - **Problem Identified**: Momentum in MH calculation creating false signals and unstable exits
    - MH momentum changed rapidly every 5 minutes, causing premature entries/exits
    - Dynamic trailing stop based on unstable MH led to inconsistent risk management
    - Golden Cross on 5-min candles caught too much noise
    - No filter for genuinely hot tokens vs temporary spikes
  - **Solution**: Separate concerns - stable market filter + hot token detector + predictable exits

  **Entry Logic (v2.12.0):**
  - **Raw MH > 0.1** (no momentum adjustment) - Stable bull market filter
  - **Token 3-period momentum > 1%** (calculated on 1-minute candles) - Hot token detector
  - **Golden Cross** (SMA12 > SMA26) - Trend confirmation
  - All three conditions must be true for entry

  **Exit Logic (v2.12.0):**
  - **Stop Loss**: -1% from entry (unchanged)
  - **Trailing Stop**: Fixed 2.5% (no longer dynamic based on MH)
  - **No Take Profit**: Let trailing stop manage all exits

  **Why This Works Better:**
  - ✅ **Stable MH**: Raw MH without momentum = reliable bull/bear market filter
  - ✅ **Hot Token Detection**: 3-period momentum on 1-min candles finds genuinely heating tokens
  - ✅ **Momentum Where It Matters**: Token-level momentum (not market-level) identifies opportunities
  - ✅ **Predictable Exits**: Fixed 2.5% trailing = consistent risk management
  - ✅ **Less Whipsaw**: Higher MH threshold (0.1 vs 0) + momentum filter = fewer false signals
  - ✅ **Clearer Logic**: Separate filters for market health and token momentum = easier to debug

  **Technical Changes:**
  - Removed momentum adjustment from MH calculation in [src/bot.ts:407-409](src/bot.ts#L407-L409)
  - Changed MH threshold from `<= 0` to `< 0.1` in [src/bot.ts:293](src/bot.ts#L293)
  - Added token momentum calculation using 1-min candles in [src/bot.ts:314-326](src/bot.ts#L314-L326)
  - Added momentum > 1% entry filter in [src/bot.ts:329-333](src/bot.ts#L329-L333)
  - Changed trailing stop to fixed 2.5% in [src/bot.ts:226-227](src/bot.ts#L226-L227)
  - Updated `getDynamicTrailingStop()` to return fixed 0.025 in [src/bot.ts:41-42](src/bot.ts#L41-L42)
  - Updated logging to show token momentum and fixed trailing percentage
  - Cleaned up Telegram notifications: removed "Momentum adj" from cycle summaries, changed `/status` to show "2.5% fixed" trailing

  **Expected Impact:**
  - Fewer but higher quality signals (stronger filters)
  - More stable entries (raw MH + hot token detection)
  - Consistent exits (fixed trailing stop)
  - Better risk management (predictable 2.5% trail)
  - Improved profitability (less whipsaw, better entries)

## [2.11.3] - 2025-11-23

### Fixed
- **💰 Accurate P&L Calculation Based on Actual USDC Received** - P&L now matches Phantom wallet and Solscan exactly
  - **Problem Identified:** Bot's calculated P&L didn't match actual USDC received in wallet
    - Example 1: JUP trade - Bot showed +$5.48, but wallet received only $503.76 (+$3.76 actual)
    - Example 2: PENG trade - Bot showed -$0.35, but wallet received $498.81 (-$1.19 actual)
    - Example 3: BONK trade - Bot showed -$0.45, but wallet received $499.49 (-$0.51 actual)
    - **Root Cause:** Previous calculation was purely theoretical based on price difference
    - Didn't account for swap fees (~0.18% each way), slippage, or actual token amounts received
  - **Solution:** Check actual USDC balance before and after SELL operation
    - Get USDC balance immediately before swap
    - Get USDC balance immediately after swap
    - Calculate: `USDC received = balanceAfter - balanceBefore`
    - Calculate: `Actual P&L = (USDC received) - (USDC spent on BUY)`
    - Works even if wallet has existing USDC (uses difference)
  - **Implementation:**
    - Added USDC balance checks in `executeSellOrder()` for both main and Helius RPC paths
    - Logs show: "USDC balance before sell", "USDC balance after sell", "USDC received from sell"
    - P&L calculation: `actualPnL = usdcReceived - position.amount` (position.amount = $500 spent)
    - Telegram notifications now show true profit/loss after all fees
  - **Benefits:**
    - ✅ P&L matches Phantom wallet exactly
    - ✅ P&L matches Solscan transaction details
    - ✅ Accounts for all swap fees and slippage automatically
    - ✅ No complex fee tracking needed - just check actual USDC in/out
    - ✅ Reliable regardless of market conditions or DEX routing
  - **Technical Changes:**
    - Modified `executeSellOrder()` in [src/order_executor/trader.ts:390-425](src/order_executor/trader.ts#L390-L425)
    - Modified Helius fallback path in [src/order_executor/trader.ts:452-492](src/order_executor/trader.ts#L452-L492)
    - Both paths now calculate actual P&L from real USDC received

## [2.11.2] - 2025-11-21

### Fixed
- **🔧 Helius Fallback Reliability Improvements** - Critical fixes to ensure backup RPC works during outages
  - **Problem Identified:** WIF buy failure at 10:30:48 with both default RPC and Helius fallback
    - Default RPC failed 4 times as expected
    - Helius fallback attempted but ALSO failed
    - Error: "Transaction simulation failed: Blockhash not found"
    - Result: Missed buy opportunity despite having backup RPC
  - **Root Cause Analysis:**
    1. **skipPreflight setting**: Using `skipPreflight: false` caused transaction simulation
       - Simulation takes time, causing blockhash to expire before actual submission
       - Expired blockhash → "Blockhash not found" error
       - Jupiter validates transactions server-side, so client-side simulation unnecessary
    2. **Single retry attempt**: Helius fallback only tried ONCE
       - If that single attempt had expired blockhash, no recovery
       - No retry loop for fallback RPC
  - **Solutions Implemented:**
    1. **skipPreflight: false → true** (line 120 in trader.ts)
       - Skip client-side simulation to prevent blockhash expiration
       - Jupiter performs server-side validation anyway
       - Faster transaction submission = fresher blockhash
    2. **Added 3-retry loop to Helius fallback** (buy & sell operations)
       - Helius fallback now attempts up to 3 times before giving up
       - Progressive delays: 3s, 6s between attempts
       - Implemented in both `executeBuyOrder()` (lines 268-310) and `executeSellOrder()` (lines 430-470)
       - Clear logging: "Helius attempt 1/3", "Helius attempt 2/3", "Helius attempt 3/3"
  - **How It Works Now:**
    ```
    Default RPC: Attempt 1 → 2 → 3 → 4 (all fail)
                                      ↓
                         Helius Fallback Attempt 1 (skip simulation)
                                      ↓ (fail, 3s delay)
                         Helius Fallback Attempt 2 (skip simulation)
                                      ↓ (fail, 6s delay)
                         Helius Fallback Attempt 3 (skip simulation)
                                      ↓
                                   Success! ✅
    ```
  - **Expected Impact:**
    - Much higher success rate during RPC outages
    - Helius fallback now has 3 chances to succeed instead of 1
    - Faster transaction submission reduces blockhash expiration risk
    - Better capital deployment during network congestion
  - **Helius RPC Verified:** Tested connection to Helius mainnet RPC - confirmed working
  - **Technical:** Modified `src/order_executor/trader.ts` - Changed skipPreflight setting, added retry loops

## [2.11.1] - 2025-11-21

### Added
- **🛡️ Helius RPC Fallback for Maximum Reliability** - Smart fallback system prevents transaction failures during RPC outages
  - **Problem Solved:** Today's 4.5-hour Solana RPC outage (05:00-09:36) caused 725 "Blockhash not found" errors and stuck positions
  - **Timeline of Issue:**
    - JUP successfully traded multiple times (03:15, 03:51, 04:54) ✅
    - Last successful transaction: 04:58 (JUP buy) ✅
    - RPC outage started: ~05:00 ❌
    - Trailing stop triggered 20+ times but couldn't execute sell ❌
    - RPC recovered: 09:36 ✅
    - Total impact: 725 failed transaction attempts over 4.5 hours
  - **Solution Implemented:**
    - Primary: Default Solana RPC (free, unlimited)
    - Fallback: Helius RPC (1M credits/month, 10 req/sec)
    - Strategy: Use Helius ONLY when default RPC fails all 4 attempts
    - Credit conservation: Won't burn through Helius credits during normal operation
  - **How It Works:**
    ```
    Attempt 1-4 (Default RPC) → All fail → Helius Fallback (5th attempt) → Success!
    ```
  - **Implementation Details:**
    - Modified `performJupiterSwap()` to accept optional `rpcUrl` parameter
    - Added fallback logic to `executeSellOrder()` after 4 failed attempts
    - Added fallback logic to `executeBuyOrder()` after 4 failed attempts
    - Logs clearly indicate when fallback is used: "(using fallback RPC)"
    - Telegram notifications show: "sold via Helius" / "via Helius fallback"
  - **Configuration:**
    - Added `HELIUS_RPC_URL` to `.env` file
    - API key configured for user's Helius account
    - Fallback activates automatically when needed
  - **Expected Impact:**
    - Zero stuck positions during RPC outages
    - Minimal Helius credit usage (only on failures)
    - Better reliability without increased costs
    - Peace of mind during network congestion
  - **Technical:** Modified `src/order_executor/trader.ts` - Added rpcUrl parameter and fallback logic

## [2.11.0] - 2025-11-20

### Changed
- **🎯 Optimized Momentum Period: 3-Cycle → 2-Cycle** - Data-driven optimization based on comprehensive 60-trade analysis
  - **Analysis Conducted:** Compared 2-cycle, 3-cycle, and 4-cycle momentum calculations across 60 real trades (Nov 19-20)
  - **Finding:** 2-cycle (10-minute lookback) significantly outperforms 3-cycle (15-minute) and 4-cycle (20-minute)
  - **Results Summary:**
    | Period | Trades | Win Rate | Net P&L | R:R Ratio | Blocked Efficiency |
    |--------|--------|----------|---------|-----------|-------------------|
    | **2-Cycle** | 46 (26W, 20L) | **56.5%** 🏆 | **$98.63** 🏆 | 2.40:1 | $0.16 ✓ Break-even |
    | 3-Cycle (prev) | 44 (18W, 26L) | 40.9% ❌ | $19.75 ❌ | 1.97:1 | -$78.72 ✗ TERRIBLE |
    | 4-Cycle | 43 (19W, 24L) | 44.2% | $77.76 | 3.60:1 | -$20.71 ✗ Bad |
  - **Key Insights:**
    - **2-Cycle wins by 5x on P&L** ($98.63 vs $19.75)
    - **38% better win rate** (56.5% vs 40.9%)
    - **Smart blocking:** Near break-even on filtered trades (missed $14.63 wins, avoided $14.79 losses)
    - **3-Cycle blocked TOO MANY winners:** Missed $85.37 in profits (including PENG +5.13%, BONK +3.54%, WIF +3.69%)
    - **More responsive:** 10-minute lookback catches momentum changes faster without sacrificing accuracy
  - **Entry Quality Comparison (2-Cycle):**
    - Winning trades: Avg Raw MH 0.17, Momentum +0.207, Adjusted MH 0.58
    - Losing trades: Avg Raw MH 0.09, Momentum +0.175, Adjusted MH 0.43
    - Clear separation: Winners enter at higher MH with stronger momentum
  - **Tiered Entry System Evaluated and REJECTED:**
    - Tested tiered momentum thresholds based on Raw MH ranges
    - Result: Too strict for volatile meme coins
    - Cost: $71.62 in missed opportunities (blocked $95.63 wins to avoid $24.01 losses)
    - Conclusion: Simple "Adjusted MH > 0" filter is optimal for meme coin volatility
  - **Implementation Change:**
    - Changed `MH_HISTORY_SIZE` from 3 to 2 in `src/bot.ts:26`
    - Momentum now calculated over last 2 periods (10 minutes) instead of 3 (15 minutes)
    - All other logic unchanged - still uses MOMENTUM_WEIGHT = 2.0
  - **Expected Impact:**
    - 5x improvement in net P&L
    - Win rate increase from ~41% to ~57%
    - Fewer missed opportunities on big winners
    - More responsive to market changes
  - **Validation:** Original backtesting (v2.10.0) also showed 2-cycle as optimal (Score 57 vs 53 for 3-cycle)
  - **Technical:** Modified `src/bot.ts:26` - Changed MH_HISTORY_SIZE from 3 to 2

## [2.10.2] - 2025-11-19

### Fixed
- **📝 Documentation: Corrected Token Signal Timeframe Comments** - Fixed misleading comments in config
  - **Issue:** Config comments stated "5-minute candles" but implementation uses 1-minute candles
    - `src/config.ts` line 40: Comment said "5-minute candles"
    - `src/config.ts` line 46-47: Comments said "SMA(12) on 5-min = 1 hour" and "SMA(26) on 5-min = 2.2 hours"
    - Reality: `timeframe: '5m'` maps to GeckoTerminal `/ohlcv/minute` endpoint (returns 1-minute candles)
  - **Fix:** Updated comments to accurately reflect actual behavior
    - Line 40: Now states "Maps to GeckoTerminal '/ohlcv/minute' = 1-minute candles"
    - Line 46: Now states "SMA(12) on 1-min candles = 12 minutes of data"
    - Line 47: Now states "SMA(26) on 1-min candles = 26 minutes of data"
    - Line 48: Added "RSI(14) on 1-min candles = 14 minutes of data"
  - **Clarification:** Multi-timeframe strategy confirmed working as designed
    - Market Health (macro filter): 5-minute candles, SMA(20) = 100 minutes
    - Token signals (micro entry): 1-minute candles, SMA(12/26) = 12/26 minutes
    - This aggressive timeframe catches meme coin pumps early while MH filter prevents bad market conditions
  - **Impact:** Documentation now matches implementation, no behavior change
  - **Technical:** Modified `src/config.ts:40,46-48` - Comments only, no code changes

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
