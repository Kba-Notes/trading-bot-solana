// src/strategy_analyzer/logic.ts

import { SMA, RSI } from 'technicalindicators';
import { logger } from '../services.js';

// Interface for indicator outputs
export interface Indicators {
    sma12: number;
    sma26: number;
    rsi14: number;
}

// Interface for the final decision object
export interface Action {
    action: 'BUY' | 'SELL' | 'HOLD';
    asset?: string;
    reason?: string;
}

/**
 * Calculates technical indicators (SMA, RSI) from a list of closing prices.
 * @param closingPrices Array of closing prices.
 * @returns An object with the latest indicator values, or null if insufficient data.
 */
export function calculateIndicators(closingPrices: number[]): Indicators | null {
    // At least 26 periods are needed for the longest SMA.
    if (closingPrices.length < 26) {
        return null;
    }

    const lastSma12 = SMA.calculate({ period: 12, values: closingPrices }).pop()!;
    const lastSma26 = SMA.calculate({ period: 26, values: closingPrices }).pop()!;
    const lastRsi14 = RSI.calculate({ period: 14, values: closingPrices }).pop()!;

    return {
        sma12: lastSma12,
        sma26: lastSma26,
        rsi14: lastRsi14,
    };
}


/**
 * Main function that analyzes an asset and returns a trading decision and calculated indicators.
 * @param closingPrices The closing prices of the asset to analyze.
 * @param marketHealthIndex The result of the market filter.
 * @param requireRsiConfirmation Whether to require RSI > 50 for entries (default: false for meme coins)
 * @returns An object with the final decision and the indicators used.
 */
export function runStrategy(
    closingPrices: number[],
    marketHealthIndex: number,
    requireRsiConfirmation: boolean = false
): { decision: Action; indicators: Indicators | null } {

    if (marketHealthIndex <= 0) {
        return {
            decision: { action: 'HOLD', reason: 'Negative market filter. Buying disabled.' },
            indicators: null
        };
    }

    const indicators = calculateIndicators(closingPrices);

    if (!indicators) {
        return {
            decision: { action: 'HOLD', reason: 'Insufficient data to calculate indicators.' },
            indicators: null
        };
    }

    const { sma12, sma26, rsi14 } = indicators;

    // Improved Golden Cross detection: Calculate full SMA arrays and check for crossovers
    // This is important because we only check once per hour, but crossovers can happen any time
    // CRITICAL: Since we check hourly but crosses can happen anytime, we need significant lookback
    // With hourly checks + volatile meme coins, crosses can be "stale" within hours
    let isGoldenCross = false;
    const lookbackCandles = 24; // Check last 24 candles (24 hours) to catch any recent crossovers

    // Calculate full SMA arrays (not just the last value)
    const sma12Array = SMA.calculate({ period: 12, values: closingPrices });
    const sma26Array = SMA.calculate({ period: 26, values: closingPrices });

    // Debug: Log current state
    const currentSma12 = sma12Array[sma12Array.length - 1];
    const currentSma26 = sma26Array[sma26Array.length - 1];
    const isCurrentlyBullish = currentSma12 > currentSma26;

    // Only check for crossovers if currently bullish (optimization)
    if (isCurrentlyBullish) {
        // Check EVERY consecutive pair of candles in the lookback window
        // Start from most recent and go back in time
        const startIdx = sma12Array.length - 1;  // Most recent candle
        const endIdx = Math.max(0, sma12Array.length - 1 - lookbackCandles);  // Lookback limit

        logger.info(`[DEBUG] Currently bullish, checking candles ${startIdx} back to ${endIdx} for crossover`);

        for (let currIdx = startIdx; currIdx > endIdx; currIdx--) {
            const prevIdx = currIdx - 1;

            const prevSma12 = sma12Array[prevIdx];
            const prevSma26 = sma26Array[prevIdx];
            const currSma12 = sma12Array[currIdx];
            const currSma26 = sma26Array[currIdx];

            // Safety check for undefined values
            if (prevSma12 === undefined || prevSma26 === undefined || currSma12 === undefined || currSma26 === undefined) {
                continue;
            }

            // Debug logging for first few checks
            const candlesAgo = startIdx - currIdx + 1;
            if (candlesAgo <= 3) {
                const wasBearish = prevSma12 <= prevSma26;
                const isBullish = currSma12 > currSma26;
                logger.info(`[DEBUG] Checking ${candlesAgo} candle(s) ago: prev[${prevIdx}]=${wasBearish ? 'BEAR' : 'BULL'}, curr[${currIdx}]=${isBullish ? 'BULL' : 'BEAR'}`);
            }

            // Check if crossover happened between these two consecutive candles
            if (prevSma12 <= prevSma26 && currSma12 > currSma26) {
                isGoldenCross = true;
                const candlesAgo = startIdx - currIdx + 1;
                const crossMessage = `Golden Cross detected ${candlesAgo} candle(s) ago: prev[${prevIdx}] SMA12=${prevSma12.toFixed(8)} <= SMA26=${prevSma26.toFixed(8)}, curr[${currIdx}] SMA12=${currSma12.toFixed(8)} > SMA26=${currSma26.toFixed(8)}`;
                logger.info(`[CROSS DETECTION] ${crossMessage}`);
                break;
            }
        }
    }

    const isRsiOk = rsi14 > 50;

    // Entry logic: Golden Cross is primary signal
    // RSI confirmation is optional (better for meme coins which often rally from oversold)
    if (requireRsiConfirmation) {
        // Conservative mode: Require both Golden Cross AND RSI > 50
        if (isGoldenCross && isRsiOk) {
            return {
                decision: { action: 'BUY', reason: 'Golden Cross (SMA 12/26) and RSI > 50' },
                indicators: indicators
            };
        }
    } else {
        // Aggressive mode (default for meme coins): Golden Cross alone is enough
        if (isGoldenCross) {
            return {
                decision: { action: 'BUY', reason: `Golden Cross (SMA 12/26) detected${isRsiOk ? ' with RSI > 50' : ` (RSI: ${rsi14.toFixed(2)})`}` },
                indicators: indicators
            };
        }
    }

    // Logic to explain HOLD decision
    let holdReason = 'Buy conditions not met.';
    if (isGoldenCross && !isRsiOk && requireRsiConfirmation) {
        // Golden Cross detected but RSI filter blocked entry
        holdReason = `Golden Cross detected but RSI below 50 (${rsi14.toFixed(2)}), waiting for momentum confirmation.`;
    } else if (sma12 > sma26) {
        holdReason = 'Trend already bullish, waiting for new crossover.';
    } else if (!isRsiOk && requireRsiConfirmation) {
        holdReason = `RSI below 50 (${rsi14.toFixed(2)}), insufficient strength.`;
    } else {
        holdReason = 'SMA 12 below SMA 26, waiting for crossover.';
    }

    return {
        decision: { action: 'HOLD', reason: holdReason },
        indicators: indicators
    };
}