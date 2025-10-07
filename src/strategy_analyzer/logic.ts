// src/strategy_analyzer/logic.ts

import { SMA, RSI } from 'technicalindicators';

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
 * @returns An object with the final decision and the indicators used.
 */
export function runStrategy(closingPrices: number[], marketHealthIndex: number): { decision: Action; indicators: Indicators | null } {

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

    const prevSma12 = SMA.calculate({ period: 12, values: closingPrices.slice(0, -1) }).pop()!;
    const prevSma26 = SMA.calculate({ period: 26, values: closingPrices.slice(0, -1) }).pop()!;

    const isGoldenCross = prevSma12 <= prevSma26 && sma12 > sma26;
    const isRsiOk = rsi14 > 50;

    if (isGoldenCross && isRsiOk) {
        return {
            decision: { action: 'BUY', reason: 'Golden Cross (SMA 12/26) and RSI > 50' },
            indicators: indicators
        };
    }

    // Logic to explain HOLD decision
    let holdReason = 'Buy conditions not met.';
    if (sma12 > sma26) {
        holdReason = 'Trend already bullish, waiting for new crossover.';
    } else if (!isRsiOk) {
        holdReason = `RSI below 50 (${rsi14.toFixed(2)}), insufficient strength.`;
    } else {
        holdReason = 'SMA 12 below SMA 26, waiting for crossover.';
    }

    return {
        decision: { action: 'HOLD', reason: holdReason },
        indicators: indicators
    };
}