// src/strategy/GoldenCrossStrategy.ts

import { SMA, RSI } from 'technicalindicators';
import { logger } from '../services.js';

/**
 * Strategy decision output
 */
export interface StrategyDecision {
    action: 'BUY' | 'SELL' | 'HOLD';
    reason: string;
}

/**
 * Technical indicators calculated by strategy
 */
export interface TechnicalIndicators {
    sma12: number;
    sma26: number;
    rsi14: number;
    currentPrice: number;
}

/**
 * Strategy configuration
 */
export interface StrategyConfig {
    shortSMAPeriod: number;
    longSMAPeriod: number;
    rsiPeriod: number;
    rsiThreshold: number;
    marketHealthThreshold: number;
}

/**
 * Golden Cross trading strategy with RSI confirmation and market health filter
 *
 * Entry conditions:
 * - SMA(12) crosses above SMA(26) (Golden Cross)
 * - RSI(14) > 50 (momentum confirmation)
 * - Market Health Index > 0 (bullish market environment)
 *
 * Exit conditions:
 * - Take profit: +4% from entry
 * - Stop loss: -2% from entry
 */
export class GoldenCrossStrategy {
    private config: StrategyConfig;
    private lastCrossState: Map<string, 'BULLISH' | 'BEARISH'>;

    constructor(config: Partial<StrategyConfig> = {}) {
        this.config = {
            shortSMAPeriod: config.shortSMAPeriod || 12,
            longSMAPeriod: config.longSMAPeriod || 26,
            rsiPeriod: config.rsiPeriod || 14,
            rsiThreshold: config.rsiThreshold || 50,
            marketHealthThreshold: config.marketHealthThreshold || 0
        };

        this.lastCrossState = new Map();
    }

    /**
     * Analyzes price data and returns trading decision
     *
     * @param assetId Unique identifier for the asset (for tracking cross state)
     * @param prices Historical price data (newest last)
     * @param marketHealthIndex Current market health score
     * @returns Strategy decision and calculated indicators
     *
     * @example
     * const { decision, indicators } = strategy.analyze('JUP', prices, 2.5);
     */
    analyze(
        assetId: string,
        prices: number[],
        marketHealthIndex: number
    ): { decision: StrategyDecision; indicators: TechnicalIndicators | null } {
        // Validate sufficient data
        const requiredDataPoints = Math.max(
            this.config.longSMAPeriod,
            this.config.rsiPeriod
        );

        if (prices.length < requiredDataPoints) {
            return {
                decision: {
                    action: 'HOLD',
                    reason: `Insufficient data (need ${requiredDataPoints}, have ${prices.length})`
                },
                indicators: null
            };
        }

        // Calculate indicators
        const sma12Values = SMA.calculate({
            period: this.config.shortSMAPeriod,
            values: prices
        });

        const sma26Values = SMA.calculate({
            period: this.config.longSMAPeriod,
            values: prices
        });

        const rsi14Values = RSI.calculate({
            period: this.config.rsiPeriod,
            values: prices
        });

        // Get current values (most recent)
        const currentSMA12 = sma12Values[sma12Values.length - 1];
        const currentSMA26 = sma26Values[sma26Values.length - 1];
        const currentRSI = rsi14Values[rsi14Values.length - 1];
        const currentPrice = prices[prices.length - 1];

        // Get previous values for cross detection
        const prevSMA12 = sma12Values[sma12Values.length - 2];
        const prevSMA26 = sma26Values[sma26Values.length - 2];

        const indicators: TechnicalIndicators = {
            sma12: currentSMA12,
            sma26: currentSMA26,
            rsi14: currentRSI,
            currentPrice
        };

        // Determine current trend state
        const currentState: 'BULLISH' | 'BEARISH' = currentSMA12 > currentSMA26 ? 'BULLISH' : 'BEARISH';
        const previousState = this.lastCrossState.get(assetId);

        // Detect fresh Golden Cross (transition from BEARISH to BULLISH)
        const freshGoldenCross = previousState === 'BEARISH' && currentState === 'BULLISH';

        // Alternative: Detect cross using previous candle data
        const crossDetected = prevSMA12 <= prevSMA26 && currentSMA12 > currentSMA26;

        // Update state
        this.lastCrossState.set(assetId, currentState);

        // Volatility filter - check if market is too choppy
        const recentPrices = prices.slice(-20);
        if (recentPrices.length >= 20) {
            const priceChanges = recentPrices.map((p, i, arr) =>
                i > 0 ? Math.abs((p - arr[i - 1]) / arr[i - 1]) : 0
            );
            const avgVolatility = priceChanges.reduce((a, b) => a + b, 0) / priceChanges.length;
            const maxVolatility = 0.05; // 5% average daily volatility threshold

            if (avgVolatility > maxVolatility) {
                return {
                    decision: {
                        action: 'HOLD',
                        reason: `High volatility detected (${(avgVolatility * 100).toFixed(2)}% > ${(maxVolatility * 100).toFixed(0)}%)`
                    },
                    indicators
                };
            }
        }

        // Decision logic
        if (marketHealthIndex <= this.config.marketHealthThreshold) {
            return {
                decision: {
                    action: 'HOLD',
                    reason: `Market health negative (${marketHealthIndex.toFixed(2)})`
                },
                indicators
            };
        }

        if (freshGoldenCross || crossDetected) {
            if (currentRSI > this.config.rsiThreshold) {
                // Calculate trend strength (SMA slope)
                const smaSlope = (currentSMA12 - prevSMA12) / prevSMA12;
                const minSlope = 0.001; // 0.1% minimum slope requirement

                if (smaSlope < minSlope) {
                    return {
                        decision: {
                            action: 'HOLD',
                            reason: `Golden Cross but trend weak (slope: ${(smaSlope * 100).toFixed(3)}% < ${(minSlope * 100).toFixed(1)}%)`
                        },
                        indicators
                    };
                }

                return {
                    decision: {
                        action: 'BUY',
                        reason: `Golden Cross with strong trend (RSI: ${currentRSI.toFixed(2)}, Slope: ${(smaSlope * 100).toFixed(3)}%)`
                    },
                    indicators
                };
            } else {
                return {
                    decision: {
                        action: 'HOLD',
                        reason: `Golden Cross but RSI too low (${currentRSI.toFixed(2)} < ${this.config.rsiThreshold})`
                    },
                    indicators
                };
            }
        }

        if (currentState === 'BULLISH') {
            return {
                decision: {
                    action: 'HOLD',
                    reason: 'Trend already bullish, waiting for new crossover.'
                },
                indicators
            };
        }

        return {
            decision: {
                action: 'HOLD',
                reason: 'Bearish trend, no entry signal.'
            },
            indicators
        };
    }

    /**
     * Resets the cross state tracking (useful for testing or restarts)
     */
    resetState(): void {
        this.lastCrossState.clear();
        logger.info('Strategy state reset');
    }

    /**
     * Gets current configuration
     */
    getConfig(): StrategyConfig {
        return { ...this.config };
    }
}
