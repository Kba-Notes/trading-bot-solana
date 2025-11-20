// Comprehensive analysis: Compare 2, 3, and 4 cycle momentum calculations
const fs = require('fs');

// Read both log files
const todayLog = fs.readFileSync('/root/trading-bot/trading-bot-2025-11-20.log', 'utf8');
const yesterdayLog = fs.readFileSync('/root/trading-bot/trading-bot-2025-11-19.log', 'utf8');

const allLogs = yesterdayLog + '\n' + todayLog;
const lines = allLogs.split('\n');

// Extract all Raw MH readings (we'll recalculate momentum ourselves)
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

// Sort by time
rawMHReadings.sort((a, b) => a.time - b.time);

console.log(`Found ${rawMHReadings.length} Raw MH readings\n`);

// Calculate momentum for each reading with different periods
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

// Add momentum calculations for each reading
const MOMENTUM_WEIGHT = 2.0;
rawMHReadings.forEach((reading, idx) => {
    reading.momentum2 = calculateMomentum(idx, 2);
    reading.momentum3 = calculateMomentum(idx, 3);
    reading.momentum4 = calculateMomentum(idx, 4);

    reading.adjusted2 = reading.momentum2 !== null ? reading.rawMH + (reading.momentum2 * MOMENTUM_WEIGHT) : null;
    reading.adjusted3 = reading.momentum3 !== null ? reading.rawMH + (reading.momentum3 * MOMENTUM_WEIGHT) : null;
    reading.adjusted4 = reading.momentum4 !== null ? reading.rawMH + (reading.momentum4 * MOMENTUM_WEIGHT) : null;
});

// Extract BUY operations
const buyOperations = [];
lines.forEach((line, lineIdx) => {
    const buyMatch = line.match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}).*Buy successful for (\w+)/);
    const trailingMatch = line.match(/🔒 Trailing stop activated.*for (\w+) at entry \(\$([\d.]+)\)/);

    if (buyMatch) {
        const timeStr = buyMatch[1];
        const time = new Date(timeStr);
        const asset = buyMatch[2];

        // Find closest MH reading
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

// Extract SELL operations
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

        // Find closest MH reading
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

    if (matchedBuy && matchedBuy.mhAtBuy) {
        completeTrades.push({
            date: sell.time.split(' ')[0],
            asset: sell.asset,
            buyTime: matchedBuy.time,
            sellTime: sell.time,
            entry: sell.entry,
            exit: sell.exit,
            pnlPercent: sell.pnlPercent,
            pnlUSD: sell.pnlUSD,
            mhAtBuy: matchedBuy.mhAtBuy,
            mhAtSell: sell.mhAtSell,
            isWin: sell.isWin
        });
    }
}

console.log('========================================');
console.log('MOMENTUM PERIOD COMPARISON');
console.log('2-Cycle vs 3-Cycle vs 4-Cycle');
console.log('========================================\n');

console.log(`Total Trades Analyzed: ${completeTrades.length}`);
console.log(`Winning Trades: ${completeTrades.filter(t => t.isWin).length}`);
console.log(`Losing Trades: ${completeTrades.filter(t => !t.isWin).length}\n`);

// Print each trade with all 3 momentum calculations
console.log('========================================');
console.log('INDIVIDUAL TRADE ANALYSIS');
console.log('========================================\n');

completeTrades.forEach((t, i) => {
    const buyMH = t.mhAtBuy;
    const sellMH = t.mhAtSell;

    console.log(`${i+1}. ${t.asset} | ${t.date} | P&L: ${t.pnlPercent>=0?'+':''}${t.pnlPercent.toFixed(2)}% ($${t.pnlUSD.toFixed(2)}) ${t.isWin ? '✅' : '❌'}`);
    console.log(`   Buy:  ${t.buyTime.split(' ')[1]}`);
    console.log(`   Sell: ${t.sellTime.split(' ')[1]}`);
    console.log('');

    if (buyMH.momentum2 !== null && buyMH.momentum3 !== null && buyMH.momentum4 !== null) {
        console.log('   AT ENTRY (BUY):');
        console.log(`   Raw MH: ${buyMH.rawMH.toFixed(2)}`);
        console.log(`   2-Cycle: Mom=${buyMH.momentum2>=0?'+':''}${buyMH.momentum2.toFixed(3)} | Adj=${buyMH.adjusted2.toFixed(2)} | ${buyMH.adjusted2 > 0 ? 'ALLOW ✓' : 'BLOCK ✗'}`);
        console.log(`   3-Cycle: Mom=${buyMH.momentum3>=0?'+':''}${buyMH.momentum3.toFixed(3)} | Adj=${buyMH.adjusted3.toFixed(2)} | ${buyMH.adjusted3 > 0 ? 'ALLOW ✓' : 'BLOCK ✗'}`);
        console.log(`   4-Cycle: Mom=${buyMH.momentum4>=0?'+':''}${buyMH.momentum4.toFixed(3)} | Adj=${buyMH.adjusted4.toFixed(2)} | ${buyMH.adjusted4 > 0 ? 'ALLOW ✓' : 'BLOCK ✗'}`);
    }
    console.log('');

    if (sellMH && sellMH.momentum2 !== null && sellMH.momentum3 !== null && sellMH.momentum4 !== null) {
        console.log('   AT EXIT (SELL):');
        console.log(`   Raw MH: ${sellMH.rawMH.toFixed(2)}`);
        console.log(`   2-Cycle: Mom=${sellMH.momentum2>=0?'+':''}${sellMH.momentum2.toFixed(3)} | Adj=${sellMH.adjusted2.toFixed(2)}`);
        console.log(`   3-Cycle: Mom=${sellMH.momentum3>=0?'+':''}${sellMH.momentum3.toFixed(3)} | Adj=${sellMH.adjusted3.toFixed(2)}`);
        console.log(`   4-Cycle: Mom=${sellMH.momentum4>=0?'+':''}${sellMH.momentum4.toFixed(3)} | Adj=${sellMH.adjusted4.toFixed(2)}`);
    }
    console.log('');
});

// Summary statistics
console.log('========================================');
console.log('SUMMARY STATISTICS BY PERIOD');
console.log('========================================\n');

function analyzeByPeriod(periodName, getMomentum, getAdjusted) {
    const validTrades = completeTrades.filter(t =>
        getMomentum(t.mhAtBuy) !== null &&
        (t.mhAtSell ? getMomentum(t.mhAtSell) !== null : true)
    );

    // Filter trades that would be allowed (Adj MH > 0)
    const allowedTrades = validTrades.filter(t => getAdjusted(t.mhAtBuy) > 0);
    const blockedTrades = validTrades.filter(t => getAdjusted(t.mhAtBuy) <= 0);

    const allowedWins = allowedTrades.filter(t => t.isWin);
    const allowedLosses = allowedTrades.filter(t => !t.isWin);

    const blockedWins = blockedTrades.filter(t => t.isWin);
    const blockedLosses = blockedTrades.filter(t => !t.isWin);

    const totalProfit = allowedWins.reduce((s, t) => s + t.pnlUSD, 0);
    const totalLoss = Math.abs(allowedLosses.reduce((s, t) => s + t.pnlUSD, 0));
    const netPnL = totalProfit - totalLoss;

    const missedProfit = blockedWins.reduce((s, t) => s + t.pnlUSD, 0);
    const avoidedLoss = Math.abs(blockedLosses.reduce((s, t) => s + t.pnlUSD, 0));

    console.log(`${periodName.toUpperCase()}:`);
    console.log(`  Trades Allowed: ${allowedTrades.length} (${allowedWins.length} wins, ${allowedLosses.length} losses)`);
    console.log(`  Trades Blocked: ${blockedTrades.length} (${blockedWins.length} wins, ${blockedLosses.length} losses)`);
    console.log(`  Win Rate: ${allowedTrades.length > 0 ? (allowedWins.length/allowedTrades.length*100).toFixed(1) : '0.0'}%`);
    console.log(`  Net P&L: $${netPnL.toFixed(2)}`);
    console.log(`  Avg Win: $${allowedWins.length > 0 ? (totalProfit/allowedWins.length).toFixed(2) : '0.00'}`);
    console.log(`  Avg Loss: $${allowedLosses.length > 0 ? (totalLoss/allowedLosses.length).toFixed(2) : '0.00'}`);
    console.log(`  R:R Ratio: ${allowedWins.length > 0 && allowedLosses.length > 0 ? (totalProfit/allowedWins.length / (totalLoss/allowedLosses.length)).toFixed(2) : 'N/A'}:1`);
    console.log(`  Missed Profit (blocked wins): $${missedProfit.toFixed(2)}`);
    console.log(`  Avoided Loss (blocked losses): $${avoidedLoss.toFixed(2)}`);
    console.log(`  Net Effect of Blocking: $${(avoidedLoss - missedProfit).toFixed(2)} ${(avoidedLoss - missedProfit) > 0 ? '✓' : '✗'}`);
    console.log('');

    // Entry MH statistics for allowed trades
    if (allowedWins.length > 0) {
        const avgWinRawMH = allowedWins.reduce((s, t) => s + t.mhAtBuy.rawMH, 0) / allowedWins.length;
        const avgWinMom = allowedWins.reduce((s, t) => s + getMomentum(t.mhAtBuy), 0) / allowedWins.length;
        const avgWinAdj = allowedWins.reduce((s, t) => s + getAdjusted(t.mhAtBuy), 0) / allowedWins.length;

        console.log(`  WINS - Entry MH: Raw=${avgWinRawMH.toFixed(2)}, Mom=${avgWinMom>=0?'+':''}${avgWinMom.toFixed(3)}, Adj=${avgWinAdj.toFixed(2)}`);
    }

    if (allowedLosses.length > 0) {
        const avgLossRawMH = allowedLosses.reduce((s, t) => s + t.mhAtBuy.rawMH, 0) / allowedLosses.length;
        const avgLossMom = allowedLosses.reduce((s, t) => s + getMomentum(t.mhAtBuy), 0) / allowedLosses.length;
        const avgLossAdj = allowedLosses.reduce((s, t) => s + getAdjusted(t.mhAtBuy), 0) / allowedLosses.length;

        console.log(`  LOSSES - Entry MH: Raw=${avgLossRawMH.toFixed(2)}, Mom=${avgLossMom>=0?'+':''}${avgLossMom.toFixed(3)}, Adj=${avgLossAdj.toFixed(2)}`);
    }

    console.log('');
}

analyzeByPeriod('2-cycle (10 min lookback)',
    mh => mh.momentum2,
    mh => mh.adjusted2
);

analyzeByPeriod('3-cycle (15 min lookback)',
    mh => mh.momentum3,
    mh => mh.adjusted3
);

analyzeByPeriod('4-cycle (20 min lookback)',
    mh => mh.momentum4,
    mh => mh.adjusted4
);

console.log('========================================');
console.log('RECOMMENDATION');
console.log('========================================\n');

// Determine best period based on net P&L and blocked efficiency
const periods = [
    { name: '2-cycle', trades: completeTrades.filter(t => t.mhAtBuy.adjusted2 > 0) },
    { name: '3-cycle', trades: completeTrades.filter(t => t.mhAtBuy.adjusted3 > 0) },
    { name: '4-cycle', trades: completeTrades.filter(t => t.mhAtBuy.adjusted4 > 0) }
];

periods.forEach(p => {
    const wins = p.trades.filter(t => t.isWin);
    const losses = p.trades.filter(t => !t.isWin);
    const profit = wins.reduce((s, t) => s + t.pnlUSD, 0);
    const loss = Math.abs(losses.reduce((s, t) => s + t.pnlUSD, 0));
    p.netPnL = profit - loss;
    p.winRate = wins.length / p.trades.length * 100;
});

periods.sort((a, b) => b.netPnL - a.netPnL);

console.log(`Best Period by Net P&L: ${periods[0].name} ($${periods[0].netPnL.toFixed(2)})`);
console.log(`Best Period by Win Rate: ${periods.sort((a, b) => b.winRate - a.winRate)[0].name} (${periods[0].winRate.toFixed(1)}%)`);
