# 📋 Next Session Implementation Plan

**Status**: Session paused to preserve context (86k tokens remaining)
**Resume After**: Token limit resets (~4 hours)
**Last Update**: 2025-10-08

---

## ✅ Completed This Session

### 1. Enhanced Telegram Notifications ✅
**Commit**: `9555963` - feat: enhance Telegram notifications with detailed trade info

**What was added**:
- ✅ Comprehensive BUY notifications with:
  - Entry price
  - Trade amount in USDC
  - Technical indicators (SMA12, SMA26, RSI, Market Health)
  - Entry signal reason

- ✅ Detailed SELL notifications with:
  - Exit price and entry price
  - P&L in dollars and percentage
  - Exit reason (TP/SL/manual)

- ✅ New notification functions:
  - `sendAnalysisSummary()` - After each analysis cycle
  - `sendPositionCheck()` - When positions are checked
  - `sendStrategyDecision()` - For transparency (non-HOLD signals)

**Status**: ✅ Committed and pushed to GitHub

---

## 🎯 Pending Implementations (Strategy Improvements)

Based on `docs/analysis_report.md` section 4.3 (Trading Strategy Weaknesses)

### 2. Trend Strength Filter 🔜
**Priority**: HIGH
**File**: `src/strategy/GoldenCrossStrategy.ts`

**Problem**: Golden Cross is lagging, may buy near tops
**Solution**: Add slope filter to confirm trend strength

**Implementation**:
```typescript
// Calculate SMA slope
const smaSlope = (currentSMA12 - previousSMA12) / previousSMA12;
const isTrendStrong = smaSlope > 0.001; // 0.1% minimum slope

// Only buy if trend is accelerating
if (freshGoldenCross && currentRSI > 50 && isTrendStrong) {
    return BUY;
}
```

**Expected Impact**:
- Reduce false signals by 20-30%
- Avoid buying exhausted moves
- Better win rate

---

### 3. Volatility Filter 🔜
**Priority**: HIGH
**File**: `src/strategy/GoldenCrossStrategy.ts` or new `src/filters/volatility.ts`

**Problem**: Trading in extreme volatility leads to whipsaws
**Solution**: Calculate average volatility, pause trading if too high

**Implementation**:
```typescript
// Calculate 20-period volatility
const priceChanges = prices.slice(-20).map((p, i, arr) =>
    i > 0 ? Math.abs((p - arr[i-1]) / arr[i-1]) : 0
);
const avgVolatility = priceChanges.reduce((a, b) => a + b) / 20;

// Don't trade if volatility > 5% average
const isVolatilityNormal = avgVolatility < 0.05;
```

**Expected Impact**:
- Avoid choppy markets
- Reduce stop-out frequency
- Better R:R ratio

---

### 4. ATR-Based Dynamic Stop Loss 🔜
**Priority**: MEDIUM
**File**: `src/order_executor/trader.ts` + `src/strategy/`

**Problem**: Fixed 2% stop loss gets hit too often in volatile meme coins
**Solution**: Use ATR (Average True Range) for dynamic stops

**Implementation**:
```typescript
import { ATR } from 'technicalindicators';

// Calculate ATR (need high, low, close data)
const atr = ATR.calculate({
    period: 14,
    high: highPrices,
    low: lowPrices,
    close: closePrices
}).pop()!;

// Dynamic stop loss
const stopLossPrice = entryPrice - (atr * 1.5); // 1.5 ATR below entry
const stopLossPercentage = ((entryPrice - stopLossPrice) / entryPrice) * 100;
```

**Data Needed**:
- High/Low prices from Birdeye API (currently only using close)
- Update `getHistoricalData()` to return OHLC data

**Expected Impact**:
- Stops adapt to market conditions
- Fewer premature stop-outs
- Better hold winners

---

### 5. Trailing Stop Loss 🔜
**Priority**: MEDIUM
**File**: `src/order_executor/trader.ts`

**Problem**: Price hits +4% but reverses before we sell
**Solution**: Trail stop loss once in profit

**Implementation**:
```typescript
// In OpenPosition interface, add:
interface OpenPosition {
    // ... existing fields
    highestPrice?: number;  // Track highest price seen
    trailingStopActive?: boolean;
}

// When checking positions:
if (currentPrice > position.entryPrice * 1.02) { // In 2% profit
    // Activate trailing stop
    position.trailingStopActive = true;
    position.highestPrice = Math.max(position.highestPrice || 0, currentPrice);

    // Trail 2% below highest price
    const trailingStopPrice = position.highestPrice * 0.98;

    if (currentPrice < trailingStopPrice) {
        // Exit with profit
        executeSellOrder(position, 'Trailing Stop');
    }
}
```

**Expected Impact**:
- Protect profits
- Let winners run
- Better average win size

---

### 6. Partial Profit Taking 🔜
**Priority**: LOW (nice to have)
**File**: `src/order_executor/trader.ts`

**Problem**: All-or-nothing exits leave money on table
**Solution**: Scale out of positions

**Implementation**:
```typescript
// Take 50% profit at +2%, let rest run to +4%
if (currentPrice >= entryPrice * 1.02 && !position.partialTaken) {
    // Sell half position
    const halfAmount = position.amount * 0.5;
    await executeSellOrder({ ...position, amount: halfAmount }, 'Partial TP');

    // Update position
    position.amount *= 0.5;
    position.partialTaken = true;
}

// Sell remaining at +4% or stop loss
if (currentPrice >= entryPrice * 1.04) {
    executeSellOrder(position, 'Full TP');
}
```

**Expected Impact**:
- Lock in some profits early
- Reduce risk
- Smoother equity curve

---

## 📊 Integration Plan (Next Session)

### Step 1: Update Data Collection
- [ ] Modify `getHistoricalData()` to return OHLC (Open, High, Low, Close)
- [ ] Update Birdeye API calls to include high/low

### Step 2: Implement Filters
- [ ] Create `src/filters/trendStrength.ts`
- [ ] Create `src/filters/volatility.ts`
- [ ] Integrate into `GoldenCrossStrategy.ts`

### Step 3: Update Strategy
- [ ] Add trend strength check
- [ ] Add volatility check
- [ ] Update decision logic

### Step 4: Enhanced Position Management
- [ ] Add ATR calculation
- [ ] Implement dynamic stop loss
- [ ] Add trailing stop logic
- [ ] Add partial profit taking

### Step 5: Update Notifications
- [ ] Integrate new notification functions in `bot.ts`
- [ ] Send analysis summaries after each cycle
- [ ] Send position check updates
- [ ] Include new indicators in trade notifications

### Step 6: Testing & Deployment
- [ ] Build and test locally
- [ ] Monitor first cycle
- [ ] Verify Telegram notifications working
- [ ] Push to GitHub
- [ ] Restart PM2 process

---

## 🔧 Technical Notes

### Required Dependencies
Already installed:
- ✅ `technicalindicators` (has ATR, SMA, RSI, EMA)

### Configuration Updates Needed
Add to `src/config.ts`:
```typescript
export const strategyConfig = {
    // ... existing
    minTrendSlope: 0.001,        // 0.1% minimum slope
    maxVolatility: 0.05,         // 5% max average volatility
    atrMultiplier: 1.5,          // Stop loss = entry - (ATR * 1.5)
    trailingStopDistance: 0.02,  // 2% trailing distance
    partialProfitLevel: 0.02,    // Take 50% at +2%
    partialProfitAmount: 0.5,    // Take 50% of position
};
```

### Files to Modify
1. `src/strategy/GoldenCrossStrategy.ts` - Add filters
2. `src/data_extractor/jupiter.ts` - Return OHLC data
3. `src/order_executor/trader.ts` - Dynamic stops, trailing, partial exits
4. `src/bot.ts` - Integrate new notifications
5. `src/config.ts` - Add new parameters

---

## 📈 Expected Improvements

### Before (Current Strategy)
- Win Rate: ~45-55%
- Risk:Reward: 2:1
- Avg Drawdown: Unknown
- Issues: Frequent stop-outs, missed profits

### After (With Improvements)
- Win Rate: ~55-65% (expected +10-20%)
- Risk:Reward: 2.5:1 to 3:1 (trailing stops)
- Better hold winners
- Reduced whipsaws
- More consistent returns

---

## 🚨 Important Reminders

Before starting next session:
1. ✅ Read `/root/trading-bot/.claude-context`
2. ✅ Read `/root/.github-credentials`
3. ✅ Check bot status: `pm2 list`
4. ✅ Review this plan
5. ✅ Create todos for tracking

During implementation:
- Create atomic commits for each feature
- Test each change before moving to next
- Update Telegram notifications as we go
- Push to GitHub after each major feature

---

## 📞 Session Context

**Repository**: https://github.com/Kba-Notes/trading-bot-solana
**Owner**: Kba-Notes (miguelcabanasb@gmail.com)
**Current Commits**: 18
**Bot Status**: Running in production (PM2)
**Language**: English (always)

---

**Ready to continue when token limit resets! 🚀**
