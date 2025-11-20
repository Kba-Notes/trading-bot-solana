// Complete analysis: MH at both BUY and SELL
const fs = require('fs');

const logContent = fs.readFileSync('/root/trading-bot/trading-bot-2025-11-20.log', 'utf8');
const lines = logContent.split('\n');

// Extract all Market Health readings
const mhReadings = [];
lines.forEach(line => {
    const mhMatch = line.match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}).*📊 Market Health: Raw=([-\d.]+) \| Momentum=([+\-][\d.]+) \| Adjusted=([-\d.]+)/);
    if (mhMatch) {
        mhReadings.push({
            time: new Date(mhMatch[1]),
            raw: parseFloat(mhMatch[2]),
            momentum: parseFloat(mhMatch[3]),
            adjusted: parseFloat(mhMatch[4])
        });
    }
});

// Extract all BUY operations
const buyOperations = [];
lines.forEach(line => {
    const buyMatch = line.match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}).*Buy successful for (\w+)/);
    const trailingMatch = line.match(/🔒 Trailing stop activated.*for (\w+) at entry \(\$([\d.]+)\) with.*\(MH=([-\d.]+)\)/);

    if (buyMatch) {
        const time = new Date(buyMatch[1]);
        const asset = buyMatch[2];

        // Find closest MH reading (within 5 minutes before buy)
        let closestMH = null;
        let minDiff = Infinity;
        for (const mh of mhReadings) {
            const diff = time - mh.time;
            if (diff >= 0 && diff < 5 * 60 * 1000 && diff < minDiff) {
                minDiff = diff;
                closestMH = mh;
            }
        }

        buyOperations.push({
            time: buyMatch[1],
            asset: asset,
            mhAtBuy: closestMH,
            entry: null  // Will be filled from trailing stop line
        });
    }

    if (trailingMatch) {
        const asset = trailingMatch[1];
        const entry = parseFloat(trailingMatch[2]);
        const mhAdjusted = parseFloat(trailingMatch[3]);

        // Find the most recent buy for this asset and update it
        for (let i = buyOperations.length - 1; i >= 0; i--) {
            if (buyOperations[i].asset === asset && buyOperations[i].entry === null) {
                buyOperations[i].entry = entry;
                // Use the MH from trailing stop line as it's more accurate
                if (buyOperations[i].mhAtBuy) {
                    buyOperations[i].mhAtBuy.adjusted = mhAdjusted;
                }
                break;
            }
        }
    }
});

// Extract all SELL operations
const sellOperations = [];
lines.forEach(line => {
    const sellMatch = line.match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}).*💰 (\w+) sold: Entry=\$([\d.]+), Exit=\$([\d.]+), P&L=([+\-][\d.]+)% \(([+\-$\d.]+)\)/);
    if (sellMatch) {
        const time = new Date(sellMatch[1]);
        const asset = sellMatch[2];
        const entry = parseFloat(sellMatch[3]);
        const exit = parseFloat(sellMatch[4]);
        const pnlPercent = parseFloat(sellMatch[5]);
        const pnlUSD = parseFloat(sellMatch[6].replace('$', ''));

        // Find closest MH reading (within 5 minutes before sell)
        let closestMH = null;
        let minDiff = Infinity;
        for (const mh of mhReadings) {
            const diff = time - mh.time;
            if (diff >= 0 && diff < 5 * 60 * 1000 && diff < minDiff) {
                minDiff = diff;
                closestMH = mh;
            }
        }

        sellOperations.push({
            time: sellMatch[1],
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

// Match each SELL with its corresponding BUY
const completeTrades = [];
for (const sell of sellOperations) {
    // Find the most recent buy for this asset with matching entry price
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

    if (matchedBuy) {
        completeTrades.push({
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

// Separate wins and losses
const wins = completeTrades.filter(t => t.isWin);
const losses = completeTrades.filter(t => !t.isWin);

console.log('========================================');
console.log('COMPLETE TRADING ANALYSIS');
console.log('WITH MH AT BOTH BUY AND SELL');
console.log('========================================\n');

console.log(`Total Trades: ${completeTrades.length}`);
console.log(`Wins: ${wins.length} (${(wins.length/completeTrades.length*100).toFixed(1)}%)`);
console.log(`Losses: ${losses.length} (${(losses.length/completeTrades.length*100).toFixed(1)}%)\n`);

const totalProfit = wins.reduce((sum, t) => sum + t.pnlUSD, 0);
const totalLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnlUSD, 0));
console.log(`Net P&L: $${(totalProfit - totalLoss).toFixed(2)}\n`);

console.log('========================================');
console.log('WINNING TRADES (with Entry & Exit MH)');
console.log('========================================\n');

wins.forEach((t, i) => {
    console.log(`${i+1}. ${t.asset} | P&L: +${t.pnlPercent.toFixed(2)}% (+$${t.pnlUSD.toFixed(2)})`);
    console.log(`   Buy:  ${t.buyTime.split(' ')[1]} @ $${t.entry.toFixed(6)}`);
    if (t.mhAtBuy) {
        console.log(`   MH at BUY:  Raw=${t.mhAtBuy.raw.toFixed(2)} | Mom=${t.mhAtBuy.momentum>=0?'+':''}${t.mhAtBuy.momentum.toFixed(3)} | Adj=${t.mhAtBuy.adjusted.toFixed(2)}`);
    }
    console.log(`   Sell: ${t.sellTime.split(' ')[1]} @ $${t.exit.toFixed(6)}`);
    if (t.mhAtSell) {
        console.log(`   MH at SELL: Raw=${t.mhAtSell.raw.toFixed(2)} | Mom=${t.mhAtSell.momentum>=0?'+':''}${t.mhAtSell.momentum.toFixed(3)} | Adj=${t.mhAtSell.adjusted.toFixed(2)}`);
    }
    if (t.mhAtBuy && t.mhAtSell) {
        const mhChange = t.mhAtSell.adjusted - t.mhAtBuy.adjusted;
        console.log(`   MH Change: ${mhChange>=0?'+':''}${mhChange.toFixed(2)} (${mhChange > 0 ? 'IMPROVED' : 'WORSENED'})`);
    }
    console.log('');
});

console.log('========================================');
console.log('LOSING TRADES (with Entry & Exit MH)');
console.log('========================================\n');

losses.forEach((t, i) => {
    console.log(`${i+1}. ${t.asset} | P&L: ${t.pnlPercent.toFixed(2)}% ($${t.pnlUSD.toFixed(2)})`);
    console.log(`   Buy:  ${t.buyTime.split(' ')[1]} @ $${t.entry.toFixed(6)}`);
    if (t.mhAtBuy) {
        console.log(`   MH at BUY:  Raw=${t.mhAtBuy.raw.toFixed(2)} | Mom=${t.mhAtBuy.momentum>=0?'+':''}${t.mhAtBuy.momentum.toFixed(3)} | Adj=${t.mhAtBuy.adjusted.toFixed(2)}`);
    }
    console.log(`   Sell: ${t.sellTime.split(' ')[1]} @ $${t.exit.toFixed(6)}`);
    if (t.mhAtSell) {
        console.log(`   MH at SELL: Raw=${t.mhAtSell.raw.toFixed(2)} | Mom=${t.mhAtSell.momentum>=0?'+':''}${t.mhAtSell.momentum.toFixed(3)} | Adj=${t.mhAtSell.adjusted.toFixed(2)}`);
    }
    if (t.mhAtBuy && t.mhAtSell) {
        const mhChange = t.mhAtSell.adjusted - t.mhAtBuy.adjusted;
        console.log(`   MH Change: ${mhChange>=0?'+':''}${mhChange.toFixed(2)} (${mhChange > 0 ? 'IMPROVED' : 'WORSENED'})`);
    }
    console.log('');
});

console.log('========================================');
console.log('PATTERN ANALYSIS');
console.log('========================================\n');

// Calculate averages for wins
const winsWithBuyMH = wins.filter(t => t.mhAtBuy);
const winsWithSellMH = wins.filter(t => t.mhAtSell);
const winsWithBoth = wins.filter(t => t.mhAtBuy && t.mhAtSell);

if (winsWithBuyMH.length > 0) {
    const avgWinBuyRaw = winsWithBuyMH.reduce((s, t) => s + t.mhAtBuy.raw, 0) / winsWithBuyMH.length;
    const avgWinBuyMom = winsWithBuyMH.reduce((s, t) => s + t.mhAtBuy.momentum, 0) / winsWithBuyMH.length;
    const avgWinBuyAdj = winsWithBuyMH.reduce((s, t) => s + t.mhAtBuy.adjusted, 0) / winsWithBuyMH.length;

    console.log('WINNING TRADES - MH at ENTRY (BUY):');
    console.log(`  Avg Raw MH: ${avgWinBuyRaw.toFixed(2)}`);
    console.log(`  Avg Momentum: ${avgWinBuyMom>=0?'+':''}${avgWinBuyMom.toFixed(3)}`);
    console.log(`  Avg Adjusted MH: ${avgWinBuyAdj.toFixed(2)}\n`);
}

if (winsWithSellMH.length > 0) {
    const avgWinSellRaw = winsWithSellMH.reduce((s, t) => s + t.mhAtSell.raw, 0) / winsWithSellMH.length;
    const avgWinSellMom = winsWithSellMH.reduce((s, t) => s + t.mhAtSell.momentum, 0) / winsWithSellMH.length;
    const avgWinSellAdj = winsWithSellMH.reduce((s, t) => s + t.mhAtSell.adjusted, 0) / winsWithSellMH.length;

    console.log('WINNING TRADES - MH at EXIT (SELL):');
    console.log(`  Avg Raw MH: ${avgWinSellRaw.toFixed(2)}`);
    console.log(`  Avg Momentum: ${avgWinSellMom>=0?'+':''}${avgWinSellMom.toFixed(3)}`);
    console.log(`  Avg Adjusted MH: ${avgWinSellAdj.toFixed(2)}\n`);
}

if (winsWithBoth.length > 0) {
    const avgMHChange = winsWithBoth.reduce((s, t) => s + (t.mhAtSell.adjusted - t.mhAtBuy.adjusted), 0) / winsWithBoth.length;
    console.log(`WINNING TRADES - Avg MH Change: ${avgMHChange>=0?'+':''}${avgMHChange.toFixed(2)}\n`);
}

// Calculate averages for losses
const lossesWithBuyMH = losses.filter(t => t.mhAtBuy);
const lossesWithSellMH = losses.filter(t => t.mhAtSell);
const lossesWithBoth = losses.filter(t => t.mhAtBuy && t.mhAtSell);

if (lossesWithBuyMH.length > 0) {
    const avgLossBuyRaw = lossesWithBuyMH.reduce((s, t) => s + t.mhAtBuy.raw, 0) / lossesWithBuyMH.length;
    const avgLossBuyMom = lossesWithBuyMH.reduce((s, t) => s + t.mhAtBuy.momentum, 0) / lossesWithBuyMH.length;
    const avgLossBuyAdj = lossesWithBuyMH.reduce((s, t) => s + t.mhAtBuy.adjusted, 0) / lossesWithBuyMH.length;

    console.log('LOSING TRADES - MH at ENTRY (BUY):');
    console.log(`  Avg Raw MH: ${avgLossBuyRaw.toFixed(2)}`);
    console.log(`  Avg Momentum: ${avgLossBuyMom>=0?'+':''}${avgLossBuyMom.toFixed(3)}`);
    console.log(`  Avg Adjusted MH: ${avgLossBuyAdj.toFixed(2)}\n`);
}

if (lossesWithSellMH.length > 0) {
    const avgLossSellRaw = lossesWithSellMH.reduce((s, t) => s + t.mhAtSell.raw, 0) / lossesWithSellMH.length;
    const avgLossSellMom = lossesWithSellMH.reduce((s, t) => s + t.mhAtSell.momentum, 0) / lossesWithSellMH.length;
    const avgLossSellAdj = lossesWithSellMH.reduce((s, t) => s + t.mhAtSell.adjusted, 0) / lossesWithSellMH.length;

    console.log('LOSING TRADES - MH at EXIT (SELL):');
    console.log(`  Avg Raw MH: ${avgLossSellRaw.toFixed(2)}`);
    console.log(`  Avg Momentum: ${avgLossSellMom>=0?'+':''}${avgLossSellMom.toFixed(3)}`);
    console.log(`  Avg Adjusted MH: ${avgLossSellAdj.toFixed(2)}\n`);
}

if (lossesWithBoth.length > 0) {
    const avgMHChange = lossesWithBoth.reduce((s, t) => s + (t.mhAtSell.adjusted - t.mhAtBuy.adjusted), 0) / lossesWithBoth.length;
    console.log(`LOSING TRADES - Avg MH Change: ${avgMHChange>=0?'+':''}${avgMHChange.toFixed(2)}\n`);
}

console.log('========================================');
console.log('KEY INSIGHTS');
console.log('========================================\n');

if (winsWithBuyMH.length > 0 && lossesWithBuyMH.length > 0) {
    const winAvgBuyAdj = winsWithBuyMH.reduce((s, t) => s + t.mhAtBuy.adjusted, 0) / winsWithBuyMH.length;
    const lossAvgBuyAdj = lossesWithBuyMH.reduce((s, t) => s + t.mhAtBuy.adjusted, 0) / lossesWithBuyMH.length;
    const buyMHDiff = winAvgBuyAdj - lossAvgBuyAdj;

    console.log(`Entry MH Difference (Wins vs Losses): ${buyMHDiff>=0?'+':''}${buyMHDiff.toFixed(2)}`);
    if (Math.abs(buyMHDiff) > 0.1) {
        console.log(`  → Wins entered at ${buyMHDiff > 0 ? 'HIGHER' : 'LOWER'} MH\n`);
    } else {
        console.log(`  → No significant difference in entry MH\n`);
    }
}

if (winsWithBoth.length > 0 && lossesWithBoth.length > 0) {
    const winAvgChange = winsWithBoth.reduce((s, t) => s + (t.mhAtSell.adjusted - t.mhAtBuy.adjusted), 0) / winsWithBoth.length;
    const lossAvgChange = lossesWithBoth.reduce((s, t) => s + (t.mhAtSell.adjusted - t.mhAtBuy.adjusted), 0) / lossesWithBoth.length;

    console.log(`MH Change During Trade:`);
    console.log(`  Wins: ${winAvgChange>=0?'+':''}${winAvgChange.toFixed(2)} (MH ${winAvgChange > 0 ? 'IMPROVED' : 'WORSENED'} during profitable trades)`);
    console.log(`  Losses: ${lossAvgChange>=0?'+':''}${lossAvgChange.toFixed(2)} (MH ${lossAvgChange > 0 ? 'IMPROVED' : 'WORSENED'} during losing trades)\n`);
}

console.log(`Win Rate: ${(wins.length/completeTrades.length*100).toFixed(1)}%`);
console.log(`Avg Win: $${(totalProfit/wins.length).toFixed(2)}`);
console.log(`Avg Loss: $${(totalLoss/losses.length).toFixed(2)}`);
console.log(`R:R Ratio: ${(totalProfit/wins.length / (totalLoss/losses.length)).toFixed(2)}:1`);
