#!/usr/bin/env node

/**
 * Backtesting script to analyze momentum-based MH adjustments
 * Analyzes historical logs to compare current strategy vs momentum-adjusted strategy
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const MOMENTUM_WEIGHTS = [0.3, 0.5, 1.0, 2.0];
const MOMENTUM_PERIODS = 4; // Look back 4 periods (20 minutes)
const MH_BUY_THRESHOLD = 0; // Current threshold

class BacktestAnalyzer {
    constructor() {
        this.mhHistory = []; // {timestamp, mh}
        this.trades = []; // {timestamp, action, asset, price, mh}
        this.logFiles = [];
    }

    // Extract MH values from log line
    extractMH(line) {
        const match = line.match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}).*Final Market Health Index: ([-\d.]+)/);
        if (match) {
            return {
                timestamp: new Date(match[1]),
                mh: parseFloat(match[2])
            };
        }
        return null;
    }

    // Extract trade events
    extractTrade(line) {
        const match = line.match(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}).*\*(🟢|🔴) (BUY|SELL) - (\w+)\*/);
        if (match && match[4] !== 'SYSTEM') {
            return {
                timestamp: new Date(match[1]),
                action: match[3],
                asset: match[4]
            };
        }
        return null;
    }

    // Calculate momentum from last N periods
    calculateMomentum(index) {
        if (index < MOMENTUM_PERIODS) {
            return 0; // Not enough history
        }

        const recentMH = this.mhHistory.slice(index - MOMENTUM_PERIODS, index);
        let totalChange = 0;

        for (let i = 1; i < recentMH.length; i++) {
            totalChange += recentMH[i].mh - recentMH[i - 1].mh;
        }

        return totalChange / (recentMH.length - 1);
    }

    // Load historical data from log files
    async loadHistoricalData(days = 7) {
        const logDir = '/root/trading-bot';
        const today = new Date();

        console.log('📂 Loading historical logs...\n');

        for (let i = 0; i < days; i++) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];
            const logFile = path.join(logDir, `trading-bot-${dateStr}.log`);

            if (fs.existsSync(logFile)) {
                console.log(`   ✓ Reading ${path.basename(logFile)}`);
                const content = fs.readFileSync(logFile, 'utf8');
                const lines = content.split('\n');

                for (const line of lines) {
                    const mh = this.extractMH(line);
                    if (mh) {
                        this.mhHistory.push(mh);
                    }

                    const trade = this.extractTrade(line);
                    if (trade) {
                        // Find closest MH value
                        const closestMH = this.findClosestMH(trade.timestamp);
                        this.trades.push({
                            ...trade,
                            mh: closestMH
                        });
                    }
                }
            }
        }

        // Sort by timestamp
        this.mhHistory.sort((a, b) => a.timestamp - b.timestamp);
        this.trades.sort((a, b) => a.timestamp - b.timestamp);

        console.log(`\n📊 Data loaded:`);
        console.log(`   • MH data points: ${this.mhHistory.length}`);
        console.log(`   • Trades: ${this.trades.length}`);
        console.log(`   • Date range: ${this.mhHistory[0]?.timestamp.toISOString()} to ${this.mhHistory[this.mhHistory.length - 1]?.timestamp.toISOString()}\n`);
    }

    // Find closest MH value to a timestamp
    findClosestMH(timestamp) {
        let closest = null;
        let minDiff = Infinity;

        for (const mh of this.mhHistory) {
            const diff = Math.abs(mh.timestamp - timestamp);
            if (diff < minDiff) {
                minDiff = diff;
                closest = mh.mh;
            }
        }

        return closest;
    }

    // Simulate trading with momentum-adjusted MH
    simulateWithMomentum(weight) {
        const results = {
            weight,
            buySignalsGenerated: 0,
            buySignalsSuppressed: 0, // Would have bought, but momentum says no
            buySignalsCreated: 0, // Wouldn't have bought, but momentum says yes
            sellsAccelerated: 0, // Sold earlier due to momentum
            sellsDelayed: 0, // Held longer due to momentum
            criticalAvoidance: [] // Cases where negative momentum prevented buy into crash
        };

        for (let i = MOMENTUM_PERIODS; i < this.mhHistory.length; i++) {
            const current = this.mhHistory[i];
            const momentum = this.calculateMomentum(i);
            const adjustedMH = current.mh + (momentum * weight);

            // Check if this would change buy decision
            const wouldBuyOriginal = current.mh > MH_BUY_THRESHOLD;
            const wouldBuyAdjusted = adjustedMH > MH_BUY_THRESHOLD;

            if (wouldBuyOriginal && !wouldBuyAdjusted) {
                results.buySignalsSuppressed++;

                // Check if this was avoiding a crash (MH drops in next 4 periods)
                if (i + MOMENTUM_PERIODS < this.mhHistory.length) {
                    const futureAvg = this.mhHistory.slice(i + 1, i + MOMENTUM_PERIODS + 1)
                        .reduce((sum, mh) => sum + mh.mh, 0) / MOMENTUM_PERIODS;

                    if (futureAvg < current.mh - 0.3) {
                        results.criticalAvoidance.push({
                            timestamp: current.timestamp,
                            mh: current.mh,
                            adjustedMH,
                            momentum,
                            futureAvg,
                            avoided: current.mh - futureAvg
                        });
                    }
                }
            } else if (!wouldBuyOriginal && wouldBuyAdjusted) {
                results.buySignalsCreated++;
            }

            // For sells, check trailing stop impact
            // MH < 0 means 0% trail (immediate sell)
            // Higher MH means higher trail percentage
            const originalTrail = this.getTrailingPercent(current.mh);
            const adjustedTrail = this.getTrailingPercent(adjustedMH);

            if (adjustedTrail < originalTrail) {
                results.sellsAccelerated++;
            } else if (adjustedTrail > originalTrail) {
                results.sellsDelayed++;
            }
        }

        return results;
    }

    // Get trailing stop percentage based on MH (from bot.ts)
    getTrailingPercent(mh) {
        if (mh < 0) return 0;
        if (mh >= 0 && mh < 0.5) return 0.005; // 0.5%
        if (mh >= 0.5 && mh < 1.0) return 0.01; // 1.0%
        if (mh >= 1.0 && mh < 1.5) return 0.015; // 1.5%
        if (mh >= 1.5 && mh < 2.0) return 0.02; // 2.0%
        if (mh >= 2.0 && mh < 2.5) return 0.025; // 2.5%
        if (mh >= 2.5 && mh < 3.0) return 0.03; // 3.0%
        return 0.035; // 3.5%
    }

    // Analyze real cases from history
    analyzeRealCases() {
        console.log('🔍 ANALYZING REAL HISTORICAL CASES\n');
        console.log('=' .repeat(80) + '\n');

        const cases = {
            deathSpirals: [],
            rapidRecoveries: [],
            stableConditions: []
        };

        for (let i = MOMENTUM_PERIODS; i < this.mhHistory.length - MOMENTUM_PERIODS; i++) {
            const current = this.mhHistory[i];
            const momentum = this.calculateMomentum(i);

            // Look ahead 4 periods
            const future = this.mhHistory.slice(i + 1, i + MOMENTUM_PERIODS + 1);
            const futureChange = future.length > 0
                ? future[future.length - 1].mh - current.mh
                : 0;

            // Case 1: Death Spiral (negative momentum, continues down)
            if (momentum < -0.15 && futureChange < -0.3) {
                cases.deathSpirals.push({
                    timestamp: current.timestamp,
                    mh: current.mh,
                    momentum,
                    futureChange
                });
            }

            // Case 3: Rapid Recovery (positive momentum after being negative)
            if (current.mh < 0 && momentum > 0.15 && futureChange > 0.3) {
                cases.rapidRecoveries.push({
                    timestamp: current.timestamp,
                    mh: current.mh,
                    momentum,
                    futureChange
                });
            }

            // Case 2: Stable (low momentum, stays stable)
            if (Math.abs(momentum) < 0.05 && Math.abs(futureChange) < 0.2) {
                cases.stableConditions.push({
                    timestamp: current.timestamp,
                    mh: current.mh,
                    momentum,
                    futureChange
                });
            }
        }

        console.log('📉 CASE 1: Death Spirals Detected');
        console.log(`   Found ${cases.deathSpirals.length} instances where negative momentum preceded continued decline\n`);
        cases.deathSpirals.slice(0, 5).forEach((c, i) => {
            console.log(`   ${i + 1}. ${c.timestamp.toISOString()}`);
            console.log(`      MH: ${c.mh.toFixed(2)} | Momentum: ${c.momentum.toFixed(2)} | Future drop: ${c.futureChange.toFixed(2)}`);
        });

        console.log('\n📈 CASE 3: Rapid Recoveries Detected');
        console.log(`   Found ${cases.rapidRecoveries.length} instances where positive momentum from negative MH preceded recovery\n`);
        cases.rapidRecoveries.slice(0, 5).forEach((c, i) => {
            console.log(`   ${i + 1}. ${c.timestamp.toISOString()}`);
            console.log(`      MH: ${c.mh.toFixed(2)} | Momentum: ${c.momentum.toFixed(2)} | Future gain: ${c.futureChange.toFixed(2)}`);
        });

        console.log('\n📊 CASE 2: Stable Conditions');
        console.log(`   Found ${cases.stableConditions.length} instances of stable market conditions\n`);

        return cases;
    }

    // Run full backtest analysis
    async runAnalysis() {
        await this.loadHistoricalData(7);

        // Analyze real cases
        const realCases = this.analyzeRealCases();

        console.log('\n' + '='.repeat(80) + '\n');
        console.log('🧪 BACKTESTING MOMENTUM-ADJUSTED MH STRATEGY\n');

        const results = [];
        for (const weight of MOMENTUM_WEIGHTS) {
            const result = this.simulateWithMomentum(weight);
            results.push(result);

            console.log(`\n📊 Weight = ${weight.toFixed(1)} (${weight * 100}% momentum impact)`);
            console.log('   ─'.repeat(40));
            console.log(`   Buy Signals Suppressed: ${result.buySignalsSuppressed} (prevented by negative momentum)`);
            console.log(`   Buy Signals Created: ${result.buySignalsCreated} (enabled by positive momentum)`);
            console.log(`   Sells Accelerated: ${result.sellsAccelerated} (tighter stops due to negative momentum)`);
            console.log(`   Sells Delayed: ${result.sellsDelayed} (wider stops due to positive momentum)`);
            console.log(`   Critical Crash Avoidance: ${result.criticalAvoidance.length} times`);

            if (result.criticalAvoidance.length > 0) {
                console.log(`\n   🛡️  Top crashes avoided:`);
                result.criticalAvoidance.slice(0, 3).forEach((avoid, i) => {
                    console.log(`      ${i + 1}. ${avoid.timestamp.toISOString()}`);
                    console.log(`         MH ${avoid.mh.toFixed(2)} → ${avoid.adjustedMH.toFixed(2)} (momentum: ${avoid.momentum.toFixed(2)})`);
                    console.log(`         Avoided ${avoid.avoided.toFixed(2)} drop (future avg: ${avoid.futureAvg.toFixed(2)})`);
                });
            }
        }

        console.log('\n' + '='.repeat(80) + '\n');
        console.log('💡 RECOMMENDATIONS\n');

        // Analyze which weight performed best
        const bestForAvoidance = results.reduce((best, r) =>
            r.criticalAvoidance.length > best.criticalAvoidance.length ? r : best
        );

        const bestBalance = results.find(r => r.weight === 1.0);

        console.log(`1. **Crash Avoidance**: Weight ${bestForAvoidance.weight} prevented ${bestForAvoidance.criticalAvoidance.length} crashes`);
        console.log(`   - Suppressed ${bestForAvoidance.buySignalsSuppressed} risky buys`);
        console.log(`   - Created ${bestForAvoidance.buySignalsCreated} recovery opportunities`);

        console.log(`\n2. **Balanced Approach (Weight 1.0)**:`);
        console.log(`   - Suppressed ${bestBalance.buySignalsSuppressed} risky buys`);
        console.log(`   - Created ${bestBalance.buySignalsCreated} recovery opportunities`);
        console.log(`   - Prevented ${bestBalance.criticalAvoidance.length} crashes`);
        console.log(`   - Accelerated ${bestBalance.sellsAccelerated} sells (avoided drawdown)`);

        console.log(`\n3. **Real Cases Found**:`);
        console.log(`   - ${realCases.deathSpirals.length} death spirals (where momentum would have prevented losses)`);
        console.log(`   - ${realCases.rapidRecoveries.length} rapid recoveries (where momentum would have enabled earlier entry)`);
        console.log(`   - ${realCases.stableConditions.length} stable conditions (where momentum has minimal impact)`);

        const recommendation = bestForAvoidance.weight;
        console.log(`\n✅ **RECOMMENDED STARTING WEIGHT: ${recommendation}**`);
        console.log(`   This weight provides the best crash avoidance while maintaining opportunity capture.`);
        console.log(`   You can tune down to 0.5 if too aggressive, or up to 2.0 for maximum responsiveness.\n`);
    }
}

// Run the analysis
const analyzer = new BacktestAnalyzer();
analyzer.runAnalysis().catch(console.error);
