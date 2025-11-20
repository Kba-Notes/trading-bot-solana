// Quick analysis script to correlate trades with Market Health
const fs = require('fs');

const logContent = fs.readFileSync('/root/trading-bot/trading-bot-2025-11-20.log', 'utf8');
const lines = logContent.split('\n');

// Extract all trades
const trades = [];
const mhValues = [];

lines.forEach((line, idx) => {
    // Extract Market Health values
    const mhMatch = line.match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}).*📊 Market Health: Raw=([-\d.]+) \| Momentum=([+-][\d.]+) \| Adjusted=([-\d.]+)/);
    if (mhMatch) {
        mhValues.push({
            time: mhMatch[1],
            raw: parseFloat(mhMatch[2]),
            momentum: parseFloat(mhMatch[3]),
            adjusted: parseFloat(mhMatch[4])
        });
    }

    // Extract trades
    const tradeMatch = line.match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}).*💰 (\w+) sold: Entry=\$([\d.]+), Exit=\$([\d.]+), P&L=([+-][\d.]+)% \(([+\-$\d.]+)\)/);
    if (tradeMatch) {
        const pnlPercent = parseFloat(tradeMatch[5]);
        const pnlUSD = parseFloat(tradeMatch[6].replace('$', ''));

        // Find closest MH value (within 10 minutes before the trade)
        const tradeTime = new Date(tradeMatch[1]);
        let closestMH = null;
        let minTimeDiff = Infinity;

        for (const mh of mhValues) {
            const mhTime = new Date(mh.time);
            const timeDiff = tradeTime - mhTime;

            // Only consider MH readings up to 10 minutes before the trade
            if (timeDiff >= 0 && timeDiff < 10 * 60 * 1000 && timeDiff < minTimeDiff) {
                minTimeDiff = timeDiff;
                closestMH = mh;
            }
        }

        trades.push({
            time: tradeMatch[1],
            asset: tradeMatch[2],
            entry: parseFloat(tradeMatch[3]),
            exit: parseFloat(tradeMatch[4]),
            pnlPercent: pnlPercent,
            pnlUSD: pnlUSD,
            mh: closestMH,
            isWin: pnlPercent > 0
        });
    }
});

// Separate winning and losing trades
const winningTrades = trades.filter(t => t.isWin);
const losingTrades = trades.filter(t => !t.isWin);

console.log('========================================');
console.log('TRADING ANALYSIS FOR 2025-11-20');
console.log('========================================\n');

console.log(`Total Trades: ${trades.length}`);
console.log(`Winning Trades: ${winningTrades.length} (${(winningTrades.length/trades.length*100).toFixed(1)}%)`);
console.log(`Losing Trades: ${losingTrades.length} (${(losingTrades.length/trades.length*100).toFixed(1)}%)\n`);

const totalProfit = winningTrades.reduce((sum, t) => sum + t.pnlUSD, 0);
const totalLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnlUSD, 0));
const netPnL = totalProfit - totalLoss;

console.log(`Total Profit: $${totalProfit.toFixed(2)}`);
console.log(`Total Loss: $${totalLoss.toFixed(2)}`);
console.log(`Net P&L: $${netPnL.toFixed(2)}\n`);

console.log('========================================');
console.log('WINNING TRADES');
console.log('========================================\n');

winningTrades.forEach((t, i) => {
    console.log(`${i+1}. ${t.asset} @ ${t.time.split(' ')[1]}`);
    console.log(`   Entry: $${t.entry.toFixed(6)} → Exit: $${t.exit.toFixed(6)}`);
    console.log(`   P&L: +${t.pnlPercent.toFixed(2)}% (+$${t.pnlUSD.toFixed(2)})`);
    if (t.mh) {
        console.log(`   MH at entry: Raw=${t.mh.raw.toFixed(2)} | Momentum=${t.mh.momentum>=0?'+':''}${t.mh.momentum.toFixed(3)} | Adjusted=${t.mh.adjusted.toFixed(2)}`);
    } else {
        console.log(`   MH: Not found`);
    }
    console.log('');
});

console.log('========================================');
console.log('LOSING TRADES');
console.log('========================================\n');

losingTrades.forEach((t, i) => {
    console.log(`${i+1}. ${t.asset} @ ${t.time.split(' ')[1]}`);
    console.log(`   Entry: $${t.entry.toFixed(6)} → Exit: $${t.exit.toFixed(6)}`);
    console.log(`   P&L: ${t.pnlPercent.toFixed(2)}% ($${t.pnlUSD.toFixed(2)})`);
    if (t.mh) {
        console.log(`   MH at entry: Raw=${t.mh.raw.toFixed(2)} | Momentum=${t.mh.momentum>=0?'+':''}${t.mh.momentum.toFixed(3)} | Adjusted=${t.mh.adjusted.toFixed(2)}`);
    } else {
        console.log(`   MH: Not found`);
    }
    console.log('');
});

console.log('========================================');
console.log('PATTERN ANALYSIS');
console.log('========================================\n');

// Analyze MH patterns for wins vs losses
const winsWithMH = winningTrades.filter(t => t.mh);
const lossesWithMH = losingTrades.filter(t => t.mh);

if (winsWithMH.length > 0) {
    const avgWinRawMH = winsWithMH.reduce((sum, t) => sum + t.mh.raw, 0) / winsWithMH.length;
    const avgWinAdjMH = winsWithMH.reduce((sum, t) => sum + t.mh.adjusted, 0) / winsWithMH.length;
    const avgWinMomentum = winsWithMH.reduce((sum, t) => sum + t.mh.momentum, 0) / winsWithMH.length;

    console.log('Winning Trades:');
    console.log(`  Average Raw MH: ${avgWinRawMH.toFixed(2)}`);
    console.log(`  Average Adjusted MH: ${avgWinAdjMH.toFixed(2)}`);
    console.log(`  Average Momentum: ${avgWinMomentum>=0?'+':''}${avgWinMomentum.toFixed(3)}`);
    console.log(`  Average Profit: $${(totalProfit/winningTrades.length).toFixed(2)}\n`);
}

if (lossesWithMH.length > 0) {
    const avgLossRawMH = lossesWithMH.reduce((sum, t) => sum + t.mh.raw, 0) / lossesWithMH.length;
    const avgLossAdjMH = lossesWithMH.reduce((sum, t) => sum + t.mh.adjusted, 0) / lossesWithMH.length;
    const avgLossMomentum = lossesWithMH.reduce((sum, t) => sum + t.mh.momentum, 0) / lossesWithMH.length;

    console.log('Losing Trades:');
    console.log(`  Average Raw MH: ${avgLossRawMH.toFixed(2)}`);
    console.log(`  Average Adjusted MH: ${avgLossAdjMH.toFixed(2)}`);
    console.log(`  Average Momentum: ${avgLossMomentum>=0?'+':''}${avgLossMomentum.toFixed(3)}`);
    console.log(`  Average Loss: $${(totalLoss/losingTrades.length).toFixed(2)}\n`);
}

console.log('========================================');
console.log('KEY INSIGHTS');
console.log('========================================\n');

// Check if wins generally have better MH
if (winsWithMH.length > 0 && lossesWithMH.length > 0) {
    const avgWinAdjMH = winsWithMH.reduce((sum, t) => sum + t.mh.adjusted, 0) / winsWithMH.length;
    const avgLossAdjMH = lossesWithMH.reduce((sum, t) => sum + t.mh.adjusted, 0) / lossesWithMH.length;
    const mhDiff = avgWinAdjMH - avgLossAdjMH;

    if (Math.abs(mhDiff) > 0.1) {
        console.log(`✓ Winning trades have ${mhDiff > 0 ? 'HIGHER' : 'LOWER'} adjusted MH by ${Math.abs(mhDiff).toFixed(2)} on average`);
    } else {
        console.log(`⚠ No significant MH difference between wins and losses (${Math.abs(mhDiff).toFixed(2)})`);
    }

    // Check momentum
    const avgWinMomentum = winsWithMH.reduce((sum, t) => sum + t.mh.momentum, 0) / winsWithMH.length;
    const avgLossMomentum = lossesWithMH.reduce((sum, t) => sum + t.mh.momentum, 0) / lossesWithMH.length;
    const momentumDiff = avgWinMomentum - avgLossMomentum;

    if (Math.abs(momentumDiff) > 0.05) {
        console.log(`✓ Winning trades have ${momentumDiff > 0 ? 'POSITIVE' : 'NEGATIVE'} momentum by ${Math.abs(momentumDiff).toFixed(3)} on average`);
    }
}

// Win rate analysis
const winRate = (winningTrades.length / trades.length * 100).toFixed(1);
console.log(`\n✓ Win Rate: ${winRate}% (${winningTrades.length}/${trades.length})`);
console.log(`✓ Average Win: $${(totalProfit/winningTrades.length).toFixed(2)}`);
console.log(`✓ Average Loss: $${(totalLoss/losingTrades.length).toFixed(2)}`);
console.log(`✓ Risk/Reward Ratio: ${(totalProfit/winningTrades.length / (totalLoss/losingTrades.length)).toFixed(2)}:1`);
