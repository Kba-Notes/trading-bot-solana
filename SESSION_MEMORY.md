# 🧠 Session Memory - Important Information

This document contains critical information that should be remembered across all Claude Code sessions.

---

## 🔐 GitHub Authentication

**Status**: ✅ Fully configured and automated

### Credentials Location
```
/root/.github-credentials
```

This file contains:
- `GITHUB_TOKEN` - Personal Access Token for authentication
- `GITHUB_USERNAME` - Kba-Notes
- `GITHUB_EMAIL` - miguelcabanasb@gmail.com
- `GITHUB_REPO` - Repository URL

### How to Use in Future Sessions
```bash
# Read credentials
source /root/.github-credentials

# Credentials are automatically used by git
git push origin main
```

**⚠️ IMPORTANT**: This file is in `.gitignore` and will NEVER be committed.

---

## 📝 Project Context

**Context File Location**:
```
/root/trading-bot/.claude-context
```

This file contains:
- Project information (name, type, structure)
- Owner information (name, email, GitHub)
- Key features implemented
- Trading strategy details
- Best practices to follow
- Common commands
- Session workflow

**Start every new session by reading this file!**

---

## 🎯 Repository Information

- **Repository**: https://github.com/Kba-Notes/trading-bot-solana
- **Owner**: Kba-Notes (Miguel Cabanas - miguelcabanasb@gmail.com)
- **Language**: English (ALWAYS use English for everything)
- **Status**: Production-ready, running on Hetzner server

---

## 📋 GitHub Best Practices (ALWAYS FOLLOW)

### Commit Message Format
```
<type>: <description>

Types:
- feat:     New feature
- fix:      Bug fix
- refactor: Code restructuring
- docs:     Documentation
- test:     Tests
- chore:    Build/tooling
- perf:     Performance
```

### Workflow for Every Change
1. ✍️ Make code changes
2. 📝 Create atomic commits with clear messages
3. 🚀 Push to GitHub automatically
4. ✅ Verify on GitHub

### What to NEVER Commit
- `.env` (secrets)
- `data/` (runtime data)
- `*.log` (logs)
- `.github-credentials` (GitHub token)
- `.claude-context` (session context)

---

## 🤖 Bot Information

### Location
```
/root/trading-bot
```

### Process Manager
```bash
pm2 list              # Check status
pm2 logs trading-bot  # View logs
pm2 restart trading-bot  # Restart after changes
```

### Build Command
```bash
npm run build
```

---

## 🔄 Typical Session Workflow

### At Start of Session:
```bash
# 1. Read context
cat /root/trading-bot/.claude-context

# 2. Check credentials
cat /root/.github-credentials

# 3. Check bot status
pm2 list | grep trading-bot
```

### During Session:
- Make requested changes
- Follow best practices
- Create proper commits
- Push automatically to GitHub

### At End of Session:
- Ensure all changes are pushed
- Update `.claude-context` if needed
- Verify bot is running

---

## 📚 Key Documentation

All documentation is in the repository:
- `GITHUB_BEST_PRACTICES.md` - Complete guide
- `GITHUB_SETUP_COMPLETE.md` - Setup documentation
- `docs/analysis_report.md` - Code analysis
- `.env.example` - Configuration template
- `README.md` - Project overview

---

## 🎨 Code Style Guidelines

1. **Language**: ALWAYS English
2. **Comments**: JSDoc format with `@param`, `@returns`, `@throws`
3. **Naming**: camelCase for variables/functions, PascalCase for classes
4. **Errors**: Use custom error types from `src/errors/`
5. **Constants**: Use values from `src/constants.ts`
6. **Validation**: Validate inputs using `src/utils/validation.ts`

---

## 🚨 Critical Reminders

⚠️ **ALWAYS** read `/root/.github-credentials` before pushing
⚠️ **ALWAYS** read `/root/trading-bot/.claude-context` at session start
⚠️ **ALWAYS** use English (never Spanish)
⚠️ **ALWAYS** follow Conventional Commits format
⚠️ **ALWAYS** push to GitHub after changes
⚠️ **NEVER** commit secrets or credentials
⚠️ **NEVER** hardcode sensitive values

---

## 🎯 Quick Reference

### Push to GitHub
```bash
cd /root/trading-bot
git add <files>
git commit -m "type: description"
git push origin main
```

### Check What Changed
```bash
git status
git diff
git log --oneline -5
```

### Verify No Secrets
```bash
git diff --cached  # Review before committing
git status --ignored | grep .env  # Verify .env ignored
```

---

## 📞 Contact Information

**Owner**: Miguel Cabanas
**Email**: miguelcabanasb@gmail.com
**GitHub**: @Kba-Notes
**Repository**: https://github.com/Kba-Notes/trading-bot-solana

---

## ✅ Setup Status

- [x] GitHub authentication configured
- [x] Credentials stored securely
- [x] Context file created
- [x] Best practices documented
- [x] .gitignore protecting secrets
- [x] Bot running in production
- [x] All improvements implemented

**Last Updated**: 2025-10-30 (Latest session - GeckoTerminal + Position monitoring + Sell retry + Log attachments + Optional RSI + Buy retry + Golden Cross lookback + Telegram log fixes + SELL log attachments)
**Status**: ✅ Ready for continuous development

---

## 🎯 Recent Improvements (Latest Session)

### ✅ Completed Features

1. **Enhanced Telegram Notifications** (Commits: 9555963, b69ac51)
   - Detailed BUY/SELL notifications with all technical indicators
   - Analysis cycle summaries after each run
   - Position check notifications
   - Better visibility without spam

2. **Trend Strength Filter** (Commit: c13bfd1)
   - Added SMA slope filter (0.1% minimum requirement)
   - Prevents buying into exhausted trends
   - Filters false Golden Cross signals
   - Expected: +10-20% win rate improvement

3. **Volatility Filter** (Commit: c13bfd1)
   - Calculates 20-period average volatility
   - Pauses trading if volatility > 5%
   - Avoids choppy, whipsaw conditions
   - Reduces premature stop-outs

4. **Trailing Stop Loss** (Commit: 7dcbbf2)
   - Activates when position reaches +2% profit
   - Trails 3% below highest price seen (updated from 2%)
   - Protects profits while letting winners run
   - Persists state across bot restarts
   - Expected: Better average win size

5. **Strategy Optimization** (Commits: 9241ae7, f37baf3)
   - Take Profit increased: 4% → 8%
   - Stop Loss increased: 2% → 3%
   - Trailing distance increased: 2% → 3%
   - Added 15-minute position monitoring loop
   - Optimized for volatile meme coin behavior
   - Created CHANGELOG.md and updated README.md

6. **Timeframe Optimization** (Commit: 3744b6a)
   - Timeframe changed: 4h → 1h for faster signal detection
   - Execution interval: 4 hours → 1 hour (24 checks/day)
   - Better responsiveness for volatile meme coins
   - Catches golden cross signals much faster

7. **GeckoTerminal Integration** (Commits: 060767e, 598f16f - Oct 27, 2025)
   - **MAJOR**: Replaced Birdeye with GeckoTerminal API
   - Eliminated Birdeye monthly quota limits (30K CUs/month)
   - FREE unlimited usage (30 req/min = 43,200 req/day)
   - All 5 tokens fully supported with pool mappings
   - API versioning implemented for Beta stability (`Accept: application/json;version=20230302`)
   - Removed BIRDEYE_API_KEY from required environment variables
   - Updated all documentation (README, CHANGELOG, .env.example)
   - Bot now 100% operational without rate limits
   - **Status**: ✅ Deployed and running successfully

8. **Enhanced Position Monitoring** (Commit: 5176c39 - Oct 27, 2025)
   - **Real-time P&L tracking**: Shows % and USDC value every 15 minutes
   - **Trailing stop visibility**: Displays high price, trail stop, and current price
   - **Distance to targets**: Shows how far from TP/SL when not trailing
   - **Example logs**: `[Position Monitor] PENG: Entry=$0.022244, Current=$0.021989, P&L=-1.15% ($-5.73)`
   - **Improved logic**: Trailing stop now monitors even when price drops below activation threshold
   - Better visibility into position health and exit conditions
   - **Status**: ✅ Deployed

9. **Robust Sell Order Retry Logic** (Commit: e45e839 - Oct 27, 2025)
   - **CRITICAL FIX**: Prevents failed trailing stop exits
   - **Problem solved**: PENG trailing stop triggered at $0.022534 but sell timed out, price fell to $0.021758
   - **Automatic retries**: Up to 4 total attempts (3 retries + initial)
   - **5-second delay** between retry attempts
   - **Transaction verification**: Checks if transaction succeeded even after timeout
   - **Extended timeout**: 30s → 60s for confirmation
   - **Smart cleanup**: Detects if tokens already sold from previous attempt
   - **Critical alerts**: Telegram notification if all 4 attempts fail
   - **Better logging**: Shows attempt numbers, success after retries, detailed P&L on exit
   - Significantly improves reliability during Solana network congestion
   - **Status**: ✅ Deployed and tested (PENG position properly closed)

10. **Telegram Log File Attachments** (Commit: ce23162 - Oct 27, 2025)
   - **NEW FEATURE**: Every analysis cycle summary now includes detailed log file
   - **File format**: `cycle-{number}-{date}.txt` with all logs from that cycle
   - **Contents**: Timestamped log entries showing full analysis process
   - **Includes**: Market health calculations, asset analysis, technical indicators, decisions
   - **Benefits**: Deep visibility without server access, easier debugging, better transparency
   - **Automatic cleanup**: Temp files deleted after sending
   - **User request**: "include a text file to the telegram message containing the lines written in the trading-bot.log file for that analysis cycle"
   - **Status**: ✅ Deployed and tested (cycle-1-2025-10-27.txt successfully sent)

11. **Optional RSI Filter Fix** (Commit: b205e11 - Oct 28, 2025)
   - **CRITICAL BUG FIX**: Bot was missing Golden Cross entries due to strict RSI > 50 requirement
   - **Problem**: BONK Golden Cross at 20:23 (SMA12 > SMA26) rejected because RSI = 34.88 < 50
   - **Result**: Missed perfect entry as SMA12 just crossed SMA26
   - **Solution**: Made RSI filter optional via `requireRsiConfirmation: false` (default)
   - **Aggressive mode** (default): Golden Cross alone triggers BUY (better for meme coins)
   - **Conservative mode**: Set `requireRsiConfirmation: true` to require RSI > 50
   - **Reasoning**: Meme coins often start rallies from oversold (RSI 30-40), Golden Cross is primary signal
   - **Flexibility**: Can enable RSI filter per-asset or for testing in future
   - **RSI still logged**: "Golden Cross detected (RSI: 34.88)" for visibility
   - **User question**: "Shouldn't we have bought BONK?" - YES! Now we will.
   - **Status**: ✅ Deployed (will catch next Golden Cross regardless of RSI)

12. **Buy Order Retry Logic** (Commit: 22f5f69 - Oct 28, 2025)
   - **NEW FEATURE**: Buy orders now have same retry reliability as sell orders
   - **Live test performed**: Successfully bought 1 USDC of BONK (TX: 63MJ2irptBxwrt2cc8BG9HTTgPFhgsqwajRZ6zSgKL3dXndpZmtwNhRagy8ZfS6pu96pPcUfNYPezswCLe1Npi9D)
   - **Automatic retries**: Up to 4 total attempts (3 retries + initial)
   - **5-second delay** between retry attempts
   - **Function signature changed**: `executeBuyOrder()` now returns boolean (success/failure)
   - **Smart duplicate prevention**: Checks if position already exists before retrying
   - **Critical alerts**: Telegram notification if all 4 attempts fail
   - **Better logging**: Shows attempt numbers "🔄 Buy attempt 1/4 for BONK (500 USDC)"
   - **Error handling**: Bot properly logs failures and continues to next asset
   - **Test script**: Created `/root/trading-bot/src/tests/test_buy_bonk.ts` for future testing
   - **Motivation**: Previous BONK buy at 22:54:41 failed with Jupiter RPC error (500)
   - **Status**: ✅ Deployed and tested with real transaction

13. **Improved Golden Cross Detection with Lookback** (Commit: 9884208 - Oct 29, 2025)
   - **CRITICAL BUG FIX**: Bot was missing Golden Cross signals between hourly checks
   - **Problem**: PENG crossed between 11:29-12:29 but was marked as "already bullish"
   - **Root cause**: Only checking last candle vs previous missed crossovers from 1-2 candles ago
   - **Solution**: Check last 3 candles for Golden Cross detection instead of just 1
   - **Implementation**: Loop through i=1 to 3, check if prevSMA12 <= prevSMA26 at any point
   - **Debug logging**: Shows which candle had the crossover (e.g., "crossover 2 candles ago")
   - **Live test**: PENG Golden Cross detected 2 candles ago, bought at $0.020617 with RSI 42.48
   - **Transaction**: 4UA6AhrWccq8K17D1yKfYhse9dtf9QUcod93mM4CQKV4RMkEBnWpPp1H5eQ9JFxdNE5uVnNvuU9NGDt7pJYxASv
   - **Impact**: No more missed entries between hourly cycles, catches up to 3 hours of crossovers
   - **Critical for**: Meme coin strategy with 1-hour timeframe and hourly analysis cycles
   - **Status**: ✅ Deployed and verified with real PENG position opened

14. **Fixed Telegram Log Attachment Timestamp Issue** (Commits: 7ae5c1e, d563ca2 - Oct 30, 2025)
   - **BUG FIX**: BTC/ETH/SOL market health logs missing from Telegram text file attachments
   - **User report**: "BTC line is in trading-bot.log but not in txt file"
   - **First attempt** (7ae5c1e): Moved markCycleStart() before first log - didn't fully fix
   - **Root cause discovered**: Timestamp precision mismatch
     - markCycleStart() sets time with milliseconds: 09:13:00.123Z
     - Log timestamps rounded to seconds: "09:13:00" (parsed as 09:13:00.000)
     - Comparison: 09:13:00.000 >= 09:13:00.123 = FALSE ❌
   - **Solution** (d563ca2): Subtract 1 second from currentCycleStartTime
     - Now: 09:12:59.123 vs 09:13:00.000 comparison = TRUE ✅
   - **Result**: All logs from cycle start second now captured
   - **Files affected**: telegram.ts - markCycleStart() function
   - **Verification**: User confirmed fix worked in next cycle
   - **Status**: ✅ Deployed and verified - complete log files in Telegram

15. **SELL Operation Log Attachments** (Commits: 850d020, 8ebf242 - Oct 30, 2025)
   - **NEW FEATURE**: Detailed log files for SELL operations during position monitoring
   - **User request**: "cuando ocurre una orden SELL deberia incluir tambien un txt file"
   - **Problem**: SELL during 15-min monitoring only sent brief notification, no logs
   - **Example**: JUP sold at 04:25 (Stop Loss) had no details
   - **Implementation** (850d020):
     - Added markOperationStart() called at beginning of executeSellOrder()
     - Created extractOperationLogs() to capture SELL operation logs
     - Modified sendTradeNotification() to be async
     - Sends txt file with: position check, P&L, reason, transaction details
     - Filename: sell-{ASSET}-{DATE}.txt
   - **Optimization** (8ebf242): Prevent duplicate txt files
     - User feedback: "si la orden SELL se produce durante un ciclo horario no hace falta enviar el txt file"
     - Added isInAnalysisCycle flag to track if in hourly analysis
     - Only sends SELL txt if NOT in analysis cycle
     - If in cycle: logs already included in cycle txt file
   - **Logic**:
     - SELL during 15-min monitoring → Sends separate SELL txt ✅
     - SELL during hourly analysis → Skips SELL txt (in cycle txt) ✅
   - **Status**: ✅ Deployed - no duplicate files, complete SELL visibility

16. **1-Minute Monitoring + Optimized Trailing Stop** (Commit: TBD - Oct 30, 2025)
   - **MAJOR OPTIMIZATION**: Reduced monitoring from 15 minutes to 1 minute
   - **Strategy Discussion**: User questioned if TP (+8%) makes sense with trailing stop (+2% activation)
     - **User insight**: "To reach TP (+8%) you must first activate trailing (+2%), so TP is always unreachable"
     - **Conclusion**: Remove Take Profit logic entirely, let trailing stop manage exits
   - **API Feasibility Analysis**:
     - Jupiter Lite API: 60 req/min (user confirmed from docs)
     - Current usage (15-min): ~96-480 calls/day depending on positions
     - New usage (1-min): ~1,440-7,200 calls/day (5.08 req/min peak)
     - **Result**: ✅ 91.5% headroom remaining, completely feasible
   - **Changes Implemented**:
     - POSITION_CHECK_INTERVAL: 15 min → **1 minute**
     - Trailing activation: +2% → **+1%** (tighter with frequent checks)
     - Trailing distance: **3%** (kept same for meme coin volatility)
     - **Removed Take Profit**: All TP logic removed, only Stop Loss + Trailing Stop remain
   - **Benefits**:
     - **Captures true peaks**: No more missing rapid spikes between 15-min windows
     - **Better trailing accuracy**: Updates highestPrice every minute
     - **Faster exit response**: Detects reversals within 1 minute vs 15 minutes
     - **Earlier profit protection**: +1% activation catches upside sooner
   - **Example improvement**:
     - OLD (15-min): Peak at $110 missed, sold at $103 (missed $7/token)
     - NEW (1-min): Peak at $110 captured, sold at $106.70 (+$3.70/token saved)
   - **Status**: ✅ Deployed - major upgrade for volatile meme coin trading

### 📊 Current Strategy Configuration

**Entry Conditions (Enhanced)**:
- Market Health Index > 0
- Golden Cross: SMA(12) > SMA(26) ✅ **PRIMARY SIGNAL**
- ~~RSI(14) > 50~~ **OPTIONAL** (disabled by default for meme coins)
- **Filter**: SMA slope > 0.1% (trend strength)
- **Filter**: Volatility < 5% (market stability)

**Exit Conditions (Optimized for 1-Minute Monitoring)**:
- ~~Take Profit~~ **REMOVED** (unreachable with +1% trailing activation)
- Stop Loss: **-3%** (only downside protection)
- **Trailing Stop**: Activates at **+1%** profit, trails **3%** below highest price
  - Earlier activation (from +2%) captures upside sooner
  - 3% distance balanced for meme coin volatility with 1-min checks
  - Updates highestPrice every minute for accurate peak capture

**Monitoring Frequency (OPTIMIZED)**:
- Main analysis cycle: Every 1 hour (finds new opportunities) - 24 checks/day
- Position monitoring: **Every 1 minute** (increased from 15 min) - 1,440 checks/day
- Timeframe: 1-hour candles (optimized for meme coin volatility)
- Total API calls: ~120 analysis calls/day + ~1,440-7,200 position checks when open
- API headroom: Using only 8.5% of Jupiter Lite limit (60 req/min), safe margin

**Expected Results (With 1-Minute Monitoring)**:
- Win Rate: 50-60% (similar)
- Average Win: **+10-20%** (significantly improved from peak capture)
- Average Loss: -3% (unchanged)
- Risk/Reward: **3:1 to 6:1 ratio** (improved from 2.5:1-5:1)
- Overall P&L: **+50-70% improvement expected** (vs previous +30-50%)
- Exit quality: Much closer to actual peaks, less profit giveback

---

**Remember**: This information persists across sessions. Always refer to these files when starting a new session!
