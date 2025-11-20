// Analyze 2-cycle momentum with tiered entry system
const fs = require('fs');

const todayLog = fs.readFileSync('/root/trading-bot/trading-bot-2025-11-20.log', 'utf8');
const yesterdayLog = fs.readFileSync('/root/trading-bot/trading-bot-2025-11-19.log', 'utf8');
const allLogs = yesterdayLog + '\n' + todayLog;
const lines = allLogs.split('\n');

// Extract all Raw MH readings
const rawMHReadings = [];
lines.forEach(line => {
    const mhMatch = line.match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}).*📊 Market Health: Raw=([-\d.]+)/);
    if (mhMatch) {
        rawMHReadings.push({
            time: new Date(mhMatch[1]),
            timeStr: mhMatch[1],
            rawMH: parseFloat(mhMatch[2])
        });
    }
});

rawMHReadings.sort((a, b) => a.time - b.time);

// Calculate 2-cycle momentum for each reading
function calculateMomentum(index, period) {
    if (index < period) return null;
    let totalChange = 0;
    for (let i = index - period + 1; i <= index; i++) {
        if (i > 0) {
            totalChange += rawMHReadings[i].rawMH - rawMHReadings[i-1].rawMH;
        }
    }
    return totalChange / (period - 1);
}

const MOMENTUM_WEIGHT = 2.0;
rawMHReadings.forEach((reading, idx) => {
    reading.momentum = calculateMomentum(idx, 2); // 2-cycle
    reading.adjusted = reading.momentum !== null ? reading.rawMH + (reading.momentum * MOMENTUM_WEIGHT) : null;
});

// Tiered entry system
function shouldEnterTiered(rawMH, momentum, adjustedMH) {
    // Rule 1: Adjusted MH must be positive
    if (adjustedMH <= 0) return false;

    // Rule 2: Strong negative Raw MH (< -0.2)
    if (rawMH < -0.2) {
        return momentum > 0.6; // Very high bar
    }

    // Rule 3: Moderate negative Raw MH (-0.2 to 0)
    if (rawMH >= -0.2 && rawMH < 0) {
        return momentum > 0.25; // Strong positive momentum required
    }

    // Rule 4: Weak positive Raw MH (0 to 0.2)
    if (rawMH >= 0 && rawMH < 0.2) {
        return momentum > 0.12; // Decent momentum required
    }

    // Rule 5: Moderate positive Raw MH (0.2 to 0.4)
    if (rawMH >= 0.2 && rawMH < 0.4) {
        return momentum > -0.10; // Allow slight negative momentum
    }

    // Rule 6: Strong positive Raw MH (>= 0.4)
    if (rawMH >= 0.4) {
        return momentum > -0.15; // Momentum less critical
    }

    return false;
}

// Extract BUY and SELL operations (same as before)
const buyOperations = [];
lines.forEach((line) => {
    const buyMatch = line.match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}).*Buy successful for (\w+)/);
    const trailingMatch = line.match(/🔒 Trailing stop activated.*for (\w+) at entry \(\$([\d.]+)\)/);

    if (buyMatch) {
        const timeStr = buyMatch[1];
        const time = new Date(timeStr);
        const asset = buyMatch[2];

        let closestMH = null;
        let minDiff = Infinity;
        for (const mh of rawMHReadings) {
            const diff = time - mh.time;
            if (diff >= 0 && diff < 10 * 60 * 1000 && diff < minDiff) {
                minDiff = diff;
                closestMH = mh;
            }
        }

        buyOperations.push({
            time: timeStr,
            asset: asset,
            mhAtBuy: closestMH,
            entry: null
        });
    }

    if (trailingMatch) {
        const asset = trailingMatch[1];
        const entry = parseFloat(trailingMatch[2]);

        for (let i = buyOperations.length - 1; i >= 0; i--) {
            if (buyOperations[i].asset === asset && buyOperations[i].entry === null) {
                buyOperations[i].entry = entry;
                break;
            }
        }
    }
});

const sellOperations = [];
lines.forEach(line => {
    const sellMatch = line.match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}).*💰 (\w+) sold: Entry=\$([\d.]+), Exit=\$([\d.]+), P&L=([+\-][\d.]+)% \(([+\-$\d.]+)\)/);
    if (sellMatch) {
        const timeStr = sellMatch[1];
        const time = new Date(timeStr);
        const asset = sellMatch[2];
        const entry = parseFloat(sellMatch[3]);
        const exit = parseFloat(sellMatch[4]);
        const pnlPercent = parseFloat(sellMatch[5]);
        const pnlUSD = parseFloat(sellMatch[6].replace('$', ''));

        let closestMH = null;
        let minDiff = Infinity;
        for (const mh of rawMHReadings) {
            const diff = time - mh.time;
            if (diff >= 0 && diff < 10 * 60 * 1000 && diff < minDiff) {
                minDiff = diff;
                closestMH = mh;
            }
        }

        sellOperations.push({
            time: timeStr,
            asset: asset,
            entry: entry,
            exit: exit,
            pnlPercent: pnlPercent,
            pnlUSD: pnlUSD,
            mhAtSell: closestMH,
            isWin: pnlPercent > 0
        });
    }
});

// Match BUYs with SELLs
const completeTrades = [];
for (const sell of sellOperations) {
    let matchedBuy = null;
    for (let i = buyOperations.length - 1; i >= 0; i--) {
        const buy = buyOperations[i];
        if (buy.asset === sell.asset &&
            Math.abs(buy.entry - sell.entry) < 0.000001 &&
            new Date(buy.time) < new Date(sell.time)) {
            matchedBuy = buy;
            break;
        }
    }

    if (matchedBuy && matchedBuy.mhAtBuy && matchedBuy.mhAtBuy.momentum !== null) {
        const mh = matchedBuy.mhAtBuy;
        completeTrades.push({
            date: sell.time.split(' ')[0],
            asset: sell.asset,
            buyTime: matchedBuy.time,
            sellTime: sell.time,
            entry: sell.entry,
            exit: sell.exit,
            pnlPercent: sell.pnlPercent,
            pnlUSD: sell.pnlUSD,
            rawMH: mh.rawMH,
            momentum: mh.momentum,
            adjustedMH: mh.adjusted,
            isWin: sell.isWin,
            passesSimple: mh.adjusted > 0,
            passesTiered: shouldEnterTiered(mh.rawMH, mh.momentum, mh.adjusted)
        });
    }
}

console.log('========================================');
console.log('TIERED ENTRY SYSTEM ANALYSIS');
console.log('2-Cycle Momentum + Tiered Filtering');
console.log('========================================\n');

console.log(`Total Trades: ${completeTrades.length}\n`);

// Simple filter (Adjusted MH > 0)
const simpleAllowed = completeTrades.filter(t => t.passesSimple);
const simpleWins = simpleAllowed.filter(t => t.isWin);
const simpleLosses = simpleAllowed.filter(t => !t.isWin);
const simpleProfit = simpleWins.reduce((s, t) => s + t.pnlUSD, 0);
const simpleLoss = Math.abs(simpleLosses.reduce((s, t) => s + t.pnlUSD, 0));

console.log('SIMPLE FILTER (Adjusted MH > 0):');
console.log(`  Trades: ${simpleAllowed.length} (${simpleWins.length}W, ${simpleLosses.length}L)`);
console.log(`  Win Rate: ${(simpleWins.length/simpleAllowed.length*100).toFixed(1)}%`);
console.log(`  Net P&L: $${(simpleProfit - simpleLoss).toFixed(2)}`);
console.log(`  Avg Win: $${(simpleProfit/simpleWins.length).toFixed(2)}`);
console.log(`  Avg Loss: $${(simpleLoss/simpleLosses.length).toFixed(2)}\n`);

// Tiered filter
const tieredAllowed = completeTrades.filter(t => t.passesTiered);
const tieredWins = tieredAllowed.filter(t => t.isWin);
const tieredLosses = tieredAllowed.filter(t => !t.isWin);
const tieredProfit = tieredWins.reduce((s, t) => s + t.pnlUSD, 0);
const tieredLoss = Math.abs(tieredLosses.reduce((s, t) => s + t.pnlUSD, 0));

console.log('TIERED FILTER (Smart Momentum Thresholds):');
console.log(`  Trades: ${tieredAllowed.length} (${tieredWins.length}W, ${tieredLosses.length}L)`);
console.log(`  Win Rate: ${(tieredWins.length/tieredAllowed.length*100).toFixed(1)}%`);
console.log(`  Net P&L: $${(tieredProfit - tieredLoss).toFixed(2)}`);
console.log(`  Avg Win: $${(tieredProfit/tieredWins.length).toFixed(2)}`);
console.log(`  Avg Loss: $${(tieredLoss/tieredLosses.length).toFixed(2)}\n`);

// Additional blocking by tiered system
const additionallyBlocked = completeTrades.filter(t => t.passesSimple && !t.passesTiered);
const blockedWins = additionallyBlocked.filter(t => t.isWin);
const blockedLosses = additionallyBlocked.filter(t => !t.isWin);

console.log('ADDITIONALLY BLOCKED BY TIERED SYSTEM:');
console.log(`  Total: ${additionallyBlocked.length} (${blockedWins.length}W, ${blockedLosses.length}L)`);
console.log(`  Missed Profit: $${blockedWins.reduce((s, t) => s + t.pnlUSD, 0).toFixed(2)}`);
console.log(`  Avoided Loss: $${Math.abs(blockedLosses.reduce((s, t) => s + t.pnlUSD, 0)).toFixed(2)}`);
const netEffect = Math.abs(blockedLosses.reduce((s, t) => s + t.pnlUSD, 0)) - blockedWins.reduce((s, t) => s + t.pnlUSD, 0);
console.log(`  Net Effect: $${netEffect.toFixed(2)} ${netEffect > 0 ? '✓' : '✗'}\n`);

console.log('========================================');
console.log('COMPARISON');
console.log('========================================\n');

const improvement = (tieredProfit - tieredLoss) - (simpleProfit - simpleLoss);
const winRateImprovement = (tieredWins.length/tieredAllowed.length) - (simpleWins.length/simpleAllowed.length);

console.log(`Net P&L Improvement: $${improvement.toFixed(2)} ${improvement > 0 ? '✓ BETTER' : '✗ WORSE'}`);
console.log(`Win Rate Improvement: ${(winRateImprovement*100).toFixed(1)}% ${winRateImprovement > 0 ? '✓ BETTER' : '✗ WORSE'}`);
console.log(`Trade Count Change: ${tieredAllowed.length - simpleAllowed.length} trades`);

console.log('\n========================================');
console.log('DETAILED BREAKDOWN');
console.log('========================================\n');

// Show trades that would be blocked by tiered system
if (additionallyBlocked.length > 0) {
    console.log('TRADES BLOCKED BY TIERED SYSTEM:\n');
    additionallyBlocked.forEach((t, i) => {
        console.log(`${i+1}. ${t.asset} | ${t.date} | P&L: ${t.pnlPercent>=0?'+':''}${t.pnlPercent.toFixed(2)}% ($${t.pnlUSD.toFixed(2)}) ${t.isWin ? '✅' : '❌'}`);
        console.log(`   Raw MH: ${t.rawMH.toFixed(2)}, Momentum: ${t.momentum>=0?'+':''}${t.momentum.toFixed(3)}, Adjusted: ${t.adjustedMH.toFixed(2)}`);

        // Determine which tier rule blocked it
        let reason = '';
        if (t.rawMH < -0.2) {
            reason = `Tier 1: Raw MH ${t.rawMH.toFixed(2)} < -0.2, needs Mom > 0.6, has ${t.momentum.toFixed(3)}`;
        } else if (t.rawMH >= -0.2 && t.rawMH < 0) {
            reason = `Tier 2: Raw MH ${t.rawMH.toFixed(2)} in [-0.2, 0], needs Mom > 0.25, has ${t.momentum.toFixed(3)}`;
        } else if (t.rawMH >= 0 && t.rawMH < 0.2) {
            reason = `Tier 3: Raw MH ${t.rawMH.toFixed(2)} in [0, 0.2], needs Mom > 0.12, has ${t.momentum.toFixed(3)}`;
        } else if (t.rawMH >= 0.2 && t.rawMH < 0.4) {
            reason = `Tier 4: Raw MH ${t.rawMH.toFixed(2)} in [0.2, 0.4], needs Mom > -0.10, has ${t.momentum.toFixed(3)}`;
        } else {
            reason = `Tier 5: Raw MH ${t.rawMH.toFixed(2)} >= 0.4, needs Mom > -0.15, has ${t.momentum.toFixed(3)}`;
        }
        console.log(`   BLOCKED: ${reason}\n`);
    });
}

console.log('\n========================================');
console.log('RECOMMENDATION');
console.log('========================================\n');

if (improvement > 5) {
    console.log('✅ TIERED SYSTEM IS BETTER!');
    console.log(`   Improves P&L by $${improvement.toFixed(2)}`);
    console.log(`   Improves win rate by ${(winRateImprovement*100).toFixed(1)}%`);
    console.log('   Recommend: Use 2-cycle momentum WITH tiered entry system');
} else if (improvement < -5) {
    console.log('❌ SIMPLE FILTER IS BETTER!');
    console.log(`   Tiered system costs $${Math.abs(improvement).toFixed(2)}`);
    console.log('   Recommend: Use 2-cycle momentum with simple Adj MH > 0 filter');
} else {
    console.log('⚖️  SIMILAR PERFORMANCE');
    console.log(`   Difference: $${improvement.toFixed(2)}`);
    console.log('   Both approaches are roughly equivalent');
}
