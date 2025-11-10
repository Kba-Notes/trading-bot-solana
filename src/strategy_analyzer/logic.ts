// src/strategy_analyzer/logic.ts

import { SMA, RSI } from 'technicalindicators';
import { logger } from '../services.js';
import { getPreviousState, updateState } from '../state/assetStates.js';

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
 * Main function that analyzes an asset and returns a trading decision.
 * Uses stateful comparison: compares current trend with previous cycle's trend.
 *
 * @param assetMint The mint address of the asset (used as unique identifier)
 * @param closingPrices The closing prices of the asset to analyze.
 * @param marketHealthIndex The result of the market filter.
 * @param requireRsiConfirmation Whether to require RSI > 50 for entries (default: false for meme coins)
 * @returns An object with the final decision and the indicators used.
 */
export function runStrategy(
    assetMint: string,
    closingPrices: number[],
    marketHealthIndex: number,
    requireRsiConfirmation: boolean = false
): { decision: Action; indicators: Indicators | null } {

    // Step 1: Check market health
    if (marketHealthIndex <= 0) {
        return {
            decision: { action: 'HOLD', reason: 'Negative market filter. Buying disabled.' },
            indicators: null
        };
    }

    // Step 2: Calculate current indicators
    const indicators = calculateIndicators(closingPrices);

    if (!indicators) {
        return {
            decision: { action: 'HOLD', reason: 'Insufficient data to calculate indicators.' },
            indicators: null
        };
    }

    const { sma12, sma26, rsi14 } = indicators;

    // Step 3: Determine current trend state
    const currentState = sma12 > sma26 ? 'BULLISH' : 'BEARISH';

    // Step 4: Get previous state from storage
    const previousState = getPreviousState(assetMint);

    logger.info(`[STATE] Asset: ${assetMint.slice(0, 8)}... | Previous: ${previousState} | Current: ${currentState} | SMA12=${sma12.toFixed(8)}, SMA26=${sma26.toFixed(8)}, RSI=${rsi14.toFixed(2)}`);

    // Step 5: Update state for next cycle
    updateState(assetMint, currentState);

    // Step 6: Check for Golden Cross (BEARISH → BULLISH transition)
    if (previousState === 'BEARISH' && currentState === 'BULLISH') {
        // Golden Cross detected!
        const isRsiOk = rsi14 > 50;

        if (requireRsiConfirmation && !isRsiOk) {
            return {
                decision: {
                    action: 'HOLD',
                    reason: `Golden Cross detected but RSI too low (${rsi14.toFixed(2)} < 50)`
                },
                indicators
            };
        }

        logger.info(`[GOLDEN CROSS] Detected for ${assetMint.slice(0, 8)}! Transition from BEARISH to BULLISH`);
        return {
            decision: {
                action: 'BUY',
                reason: `Golden Cross (SMA 12/26)${isRsiOk ? ' with RSI > 50' : ` (RSI: ${rsi14.toFixed(2)})`}`
            },
            indicators
        };
    }

    // Step 7: No Golden Cross - return appropriate HOLD reason
    let holdReason: string;

    if (currentState === 'BEARISH') {
        holdReason = 'SMA 12 below SMA 26, waiting for crossover.';
    } else {
        // currentState === 'BULLISH' && previousState === 'BULLISH'
        holdReason = 'Trend already bullish, waiting for new crossover.';
    }

    return {
        decision: { action: 'HOLD', reason: holdReason },
        indicators
    };
}
