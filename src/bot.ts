// src/bot.ts

import { logger } from './services.js';
import { assetsToTrade, strategyConfig, BOT_EXECUTION_INTERVAL, POSITION_CHECK_INTERVAL, USDC_MINT, marketFilterConfig } from './config.js';
import { getHistoricalData as getJupiterHistoricalData, getCurrentPrice } from './data_extractor/jupiter.js';
import { runStrategy } from './strategy_analyzer/logic.js';
import { executeBuyOrder, executeSellOrder, getOpenPositions, initializeTrader } from './order_executor/trader.js';
import { sendMessage, sendAnalysisSummary, sendPositionCheck, markCycleStart } from './notifier/telegram.js';
import { initializeCommandHandlers } from './notifier/commandHandler.js';
import { loadAssetStates, resetState } from './state/assetStates.js';
import { savePositions } from './persistence/positions.js';
import { SMA } from 'technicalindicators';
import axios from 'axios';
import { sleep, executeWithTiming } from './utils/async.js';
import { API_DELAYS, BOT_CONSTANTS, RETRY_CONFIG } from './constants.js';
import { validateEnvironment } from './config/env-validator.js';
import { ShutdownManager } from './utils/shutdown.js';
import { PerformanceMetrics } from './monitoring/metrics.js';
import { GoldenCrossStrategy } from './strategy/GoldenCrossStrategy.js';
import { getErrorMessage, getErrorContext } from './errors/custom-errors.js';

let executionCycleCounter = 0;
let latestMarketHealth = 0; // Store latest market health for dynamic trailing stops

// Momentum-based Market Health adjustment (v2.11.0: Optimized to 2-cycle)
const MH_HISTORY_SIZE = 2; // Track last 2 periods (10 minutes) - optimal from 60-trade analysis
const MOMENTUM_WEIGHT = 2.0; // Weight for momentum adjustment (2.0 = full impact from backtesting)
const mhHistory: Array<{ timestamp: Date; mh: number }> = [];

// v2.12.2: Real-time price history for momentum calculation (Jupiter live prices)
// Store last 3 prices per token for accurate momentum tracking
interface PriceSnapshot {
    price: number;
    timestamp: Date;
}
const priceHistory: Map<string, PriceSnapshot[]> = new Map();

const strategy = new GoldenCrossStrategy({
    shortSMAPeriod: strategyConfig.shortSMAPeriod,
    longSMAPeriod: strategyConfig.longSMAPeriod,
    rsiPeriod: strategyConfig.rsiPeriod,
    rsiThreshold: strategyConfig.rsiThreshold
});

/**
 * Get fixed trailing stop percentage (v2.12.0: removed dynamic MH-based logic)
 * Fixed at 2.5% for consistent, predictable exits
 */
export function getDynamicTrailingStop(marketHealth: number): number {
    return 0.025; // Fixed 2.5% trailing stop (no longer dynamic)
}

/**
 * Get the latest market health value (used by command handlers)
 */
export function getLatestMarketHealth(): number {
    return latestMarketHealth;
}

/**
 * Calculate momentum from recent MH history
 * Returns average rate of change over last N periods
 */
function calculateMHMomentum(): number {
    if (mhHistory.length < 2) {
        return 0; // Not enough history
    }

    let totalChange = 0;
    for (let i = 1; i < mhHistory.length; i++) {
        totalChange += mhHistory[i].mh - mhHistory[i - 1].mh;
    }

    return totalChange / (mhHistory.length - 1);
}

/**
 * Get momentum-adjusted Market Health
 * Applies momentum factor to raw MH for more responsive decision making
 * @param rawMH - Raw Market Health value
 * @returns Adjusted Market Health with momentum applied
 */
function getAdjustedMarketHealth(rawMH: number): number {
    const momentum = calculateMHMomentum();
    const adjustedMH = rawMH + (momentum * MOMENTUM_WEIGHT);

    // Always log momentum adjustment (show both raw and adjusted)
    const adjustment = adjustedMH - rawMH;
    logger.info(`📊 Market Health: Raw=${rawMH.toFixed(2)} | Momentum=${momentum > 0 ? '+' : ''}${momentum.toFixed(3)} | Adjusted=${adjustedMH.toFixed(2)} (${adjustment > 0 ? '+' : ''}${adjustment.toFixed(2)} from momentum)`);

    // Warn on significant trends
    if (momentum < -0.15) {
        logger.warn(`⚠️  Strong negative momentum (${momentum.toFixed(2)}) - market declining, buy signals suppressed`);
    } else if (momentum > 0.15) {
        logger.info(`✅ Strong positive momentum (${momentum.toFixed(2)}) - market recovering, recovery opportunities enabled`);
    }

    return adjustedMH;
}

// Fetches historical price data from CoinGecko with retry logic
// CoinGecko auto-granularity: days<=1 = 5-minute data, 1-90 days = hourly data, >90 days = daily data
async function getCoingeckoHistoricalData(id: string, retries: number = 3): Promise<number[]> {
    // Request 0.15 days (3.6 hours = 216 minutes) to get 5-minute candles
    // This gives us ~43 data points (5-minute intervals) for SMA(20) on 5-minute timeframe
    // Aligns with bot's 5-minute analysis cycle (BOT_EXECUTION_INTERVAL)
    const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=0.15`;

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await axios.get(url);
            if (response.data && response.data.prices) {
                return response.data.prices.map((priceEntry: [number, number]) => priceEntry[1]);
            }
            return [];
        } catch (error: any) {
            if (attempt < retries) {
                const backoffDelay = Math.min(RETRY_CONFIG.BASE_DELAY * Math.pow(2, attempt - 1), RETRY_CONFIG.MAX_DELAY);
                logger.warn(`Error fetching CoinGecko data for ${id} (attempt ${attempt}/${retries}): ${error.message}. Retrying in ${backoffDelay}ms...`);
                await sleep(backoffDelay);
            } else {
                logger.error(`Error fetching CoinGecko data for ${id} after ${retries} attempts: ${error.message}`);
                return [];
            }
        }
    }
    return [];
}

// Fetches historical price data from Birdeye (used for SOL)
async function getBirdeyeHistoricalData(mint: string): Promise<number[]> {
    try {
        const daysAgo = Math.floor((Date.now() - BOT_CONSTANTS.MARKET_HEALTH_HISTORY_DAYS * 24 * 60 * 60 * 1000) / 1000);
        const now = Math.floor(Date.now() / 1000);
        const url = `https://public-api.birdeye.so/defi/history_price?address=${mint}&address_type=token&type=1D&time_from=${daysAgo}&time_to=${now}`;
        const headers = {'X-API-KEY': process.env.BIRDEYE_API_KEY};
        const response = await axios.get(url, { headers });
        if (response.data && response.data.data.items) {
            return response.data.data.items.map((item: any) => item.value);
        }
        return [];
    } catch (error: any) {
        logger.error(`Error fetching Birdeye data for ${mint}:`, error.message);
        return [];
    }
}

async function calculateMarketHealth(): Promise<number> {
    let weightedDistanceSum = 0;
    let totalWeightProcessed = 0;
    logger.info('Calculating Market Health Index...');

    for (const asset of marketFilterConfig.assets) {
        // Use CoinGecko for all assets (BTC, ETH, SOL)
        const prices = await getCoingeckoHistoricalData(asset.id);

        if (prices.length < marketFilterConfig.indicatorPeriod) {
            // Fallback: Treat failed asset as 0% distance (neutral contribution)
            logger.warn(`Insufficient data for ${asset.name} in market filter. Using 0% distance as fallback.`);
            const distance = 0;
            weightedDistanceSum += distance * asset.weight;
            totalWeightProcessed += asset.weight;
            logger.info(`  - ${asset.name}: FAILED (using 0% distance fallback)`);
            // Pause to be respectful with free APIs
            await sleep(API_DELAYS.MARKET_DATA_API);
            continue;
        }

        const currentPrice = prices[prices.length - 1];
        const sma = SMA.calculate({ period: marketFilterConfig.indicatorPeriod, values: prices }).pop()!;

        const distance = ((currentPrice - sma) / sma) * 100;
        weightedDistanceSum += distance * asset.weight;
        totalWeightProcessed += asset.weight;

        logger.info(`  - ${asset.name}: Price=${currentPrice.toFixed(2)}, SMA20=${sma.toFixed(2)}, Distance=${distance.toFixed(2)}%`);
        // Pause to be respectful with free APIs
        await sleep(API_DELAYS.MARKET_DATA_API);
    }

    logger.info(`Final Market Health Index: ${weightedDistanceSum.toFixed(2)} (processed ${(totalWeightProcessed * 100).toFixed(0)}% of weight)`);
    return weightedDistanceSum;
}

async function checkOpenPositions() {
    const openPositions = getOpenPositions();
    if (openPositions.length === 0) return;

    logger.info(`Checking ${openPositions.length} open positions...`);

    for (const position of openPositions) {
        const assetConfig = assetsToTrade.find(a => a.mint === position.asset);
        if (!assetConfig) continue;

        const currentPrice = await getCurrentPrice(position.asset);
        if (currentPrice === null) {
            logger.warn(`Could not get current price for ${assetConfig.name}, cannot verify position.`);
            continue;
        }

        // Calculate P&L
        const pnlPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
        const pnlUSDC = (currentPrice - position.entryPrice) * (position.amount / position.entryPrice);
        const pnlSign = pnlPercent >= 0 ? '+' : '';

        // Determine decimal places based on price magnitude
        const decimals = currentPrice < 0.01 ? 8 : 6;

        // Log position status with P&L
        logger.info(`[Position Monitor] ${assetConfig.name}: Entry=$${position.entryPrice.toFixed(decimals)}, Current=$${currentPrice.toFixed(decimals)}, P&L=${pnlSign}${pnlPercent.toFixed(2)}% (${pnlSign}$${pnlUSDC.toFixed(2)})`);

        const stopLossPrice = position.entryPrice * (1 - strategyConfig.stopLossPercentage);

        // Ensure trailing stop is active (for positions loaded from disk that may not have it set)
        if (!position.trailingStopActive) {
            position.trailingStopActive = true;
            position.highestPrice = Math.max(currentPrice, position.entryPrice);
            await savePositions(getOpenPositions());
            logger.info(`🔒 Trailing stop activated for ${assetConfig.name} (loaded from disk)`);
        }

        // Monitor trailing stop (should always be active for all positions)
        if (position.trailingStopActive) {
            // Update highest price if current is higher
            const previousHighest = position.highestPrice || currentPrice;
            position.highestPrice = Math.max(previousHighest, currentPrice);

            // Persist if highest price was updated
            if (position.highestPrice > previousHighest) {
                await savePositions(getOpenPositions());
            }

            // Fixed 2.5% trailing stop (v2.12.0: no longer dynamic based on MH)
            const trailingStopPercent = 0.025; // Fixed 2.5%
            const trailingStopPrice = position.highestPrice * (1 - trailingStopPercent);

            // Calculate potential P&L if trailing stop is hit
            const potentialPnlPercent = ((trailingStopPrice - position.entryPrice) / position.entryPrice) * 100;
            const potentialPnlUSDC = (trailingStopPrice - position.entryPrice) * (position.amount / position.entryPrice);
            const pnlSign = potentialPnlPercent >= 0 ? '+' : '';

            // Log trailing stop status with fixed percentage, potential P&L, and highest price
            logger.info(`[Trailing] ${assetConfig.name}: Trail Stop=$${trailingStopPrice.toFixed(decimals)} (${(trailingStopPercent * 100).toFixed(1)}% fixed trail), Potential P&L=${pnlSign}${potentialPnlPercent.toFixed(2)}% (${pnlSign}$${potentialPnlUSDC.toFixed(2)}), Highest=$${position.highestPrice.toFixed(decimals)}`);

            // Show distance to move trailing up (how much price needs to rise to beat current high)
            const distanceToNewHigh = ((position.highestPrice - currentPrice) / currentPrice) * 100;
            const distanceToTrailingStop = ((currentPrice - trailingStopPrice) / currentPrice) * 100;
            logger.info(`[Targets] ${assetConfig.name}: New high=${distanceToNewHigh.toFixed(2)}% away, Trail hit=${distanceToTrailingStop.toFixed(2)}% away`);

            if (currentPrice < trailingStopPrice) {
                logger.info(`🎯 Trailing stop hit for ${assetConfig.name}! Trail Stop: $${trailingStopPrice.toFixed(decimals)}, Current: $${currentPrice.toFixed(decimals)}`);
                await executeSellOrder(position);
                // Reset state to BEARISH after selling
                resetState(position.asset);
                await sleep(API_DELAYS.RATE_LIMIT);
                continue;
            }
        }

        // Check Stop Loss (only exit condition besides trailing stop)
        let shouldSell = false;
        let sellReason = '';

        if (currentPrice <= stopLossPrice) {
            logger.info(`⛔ STOP LOSS reached for ${assetConfig.name}! Stop: $${stopLossPrice.toFixed(decimals)}, Current: $${currentPrice.toFixed(decimals)}`);
            shouldSell = true;
            sellReason = 'Stop Loss';
        } else {
            // Log distance to stop loss if not trailing yet
            if (!position.trailingStopActive) {
                const distanceToBreakeven = ((position.entryPrice - currentPrice) / currentPrice) * 100;
                const distanceToSL = ((currentPrice - stopLossPrice) / currentPrice) * 100;
                logger.info(`[Targets] ${assetConfig.name}: Breakeven=${Math.abs(distanceToBreakeven).toFixed(2)}% away, SL=${distanceToSL.toFixed(2)}% away`);
            }
        }

        if (shouldSell) {
            await executeSellOrder(position);
            // Reset state to BEARISH after selling
            resetState(position.asset);
        }

        // Add delay between position checks to reduce RPC load
        await sleep(API_DELAYS.POSITION_CHECK);
    }
}

/**
 * v2.12.2: Check token momentum every 1 minute using Jupiter real-time prices
 * Uses averaged consecutive variations for more accurate momentum detection
 */
async function checkTokenMomentumForBuy(): Promise<number> {
    // Check if market is bullish (cached MH value from 5-min cycle)
    if (latestMarketHealth < 0.1) {
        logger.info(`[1-Min Check] Skipped - MH ${latestMarketHealth.toFixed(2)}% < 0.1 (market bearish)`);
        return 0; // No checks when market is bearish
    }

    logger.info(`[1-Min Check] Starting token momentum scan (MH=${latestMarketHealth.toFixed(2)}%)...`);

    const openPositions = getOpenPositions();
    let buySignals = 0;

    for (const asset of assetsToTrade) {
        // Skip if position already exists
        if (openPositions.some(p => p.asset === asset.mint)) {
            logger.info(`  ${asset.name}: Position exists, skipping`);
            continue;
        }

        try {
            // Fetch current Jupiter price (real-time)
            const currentPrice = await getCurrentPrice(asset.mint);
            if (!currentPrice) {
                logger.warn(`  ${asset.name}: Could not get current price`);
                await sleep(API_DELAYS.RATE_LIMIT);
                continue;
            }

            // Get or initialize price history for this asset
            if (!priceHistory.has(asset.mint)) {
                priceHistory.set(asset.mint, []);
            }
            const history = priceHistory.get(asset.mint)!;

            // Add current price to history
            history.push({ price: currentPrice, timestamp: new Date() });

            // Keep only last 3 prices
            if (history.length > 3) {
                history.shift();
            }

            // Need at least 3 prices to calculate momentum
            if (history.length < 3) {
                logger.info(`  ${asset.name}: Building price history (${history.length}/3 prices)`);
                await sleep(API_DELAYS.RATE_LIMIT);
                continue;
            }

            // Calculate momentum using averaged consecutive variations
            // T-2, T-1, T (current)
            const priceT2 = history[0].price;  // 2 periods ago
            const priceT1 = history[1].price;  // 1 period ago
            const priceT = history[2].price;   // Current

            // Variation from T-2 to T-1
            const variation1 = ((priceT1 - priceT2) / priceT2) * 100;

            // Variation from T-1 to T
            const variation2 = ((priceT - priceT1) / priceT1) * 100;

            // Momentum = average of the two variations
            const tokenMomentum = (variation1 + variation2) / 2;

            // Log with detailed breakdown
            logger.info(`  ${asset.name}: Momentum ${tokenMomentum > 0 ? '+' : ''}${tokenMomentum.toFixed(2)}%`);
            logger.info(`    └─ Prices: T-2=$${priceT2.toFixed(8)} → T-1=$${priceT1.toFixed(8)} → T=$${priceT.toFixed(8)}`);
            logger.info(`    └─ Var1: ${variation1 > 0 ? '+' : ''}${variation1.toFixed(2)}%, Var2: ${variation2 > 0 ? '+' : ''}${variation2.toFixed(2)}%, Avg: ${tokenMomentum > 0 ? '+' : ''}${tokenMomentum.toFixed(2)}%`);

            // Check momentum threshold (v2.12.4: lowered from 1.0% to 0.65% to catch more bullish trends)
            if (tokenMomentum <= 0.65) {
                logger.info(`    └─ Below 0.65% threshold - HOLD`);
                await sleep(API_DELAYS.RATE_LIMIT);
                continue;
            }

            // Token has momentum > 0.65%, check Golden Cross
            logger.info(`    └─ Above 0.65% threshold - Checking Golden Cross...`);

            // Fetch 5-min historical data for Golden Cross check
            const historicalPrices = await getJupiterHistoricalData(asset.geckoPool, strategyConfig.timeframe, strategyConfig.historicalDataLimit);
            if (historicalPrices.length < BOT_CONSTANTS.MIN_HISTORICAL_DATA_POINTS) {
                logger.warn(`    └─ Insufficient 5-min historical data for Golden Cross check`);
                await sleep(API_DELAYS.RATE_LIMIT);
                continue;
            }

            // Run strategy to check Golden Cross
            const { decision, indicators } = runStrategy(asset.mint, historicalPrices, latestMarketHealth, strategyConfig.requireRsiConfirmation);

            if (decision.action === 'BUY') {
                buySignals++;
                logger.info(`    └─ ✅ GOLDEN CROSS CONFIRMED - ${decision.reason}`);
                logger.info(`    └─ 🟢 BUY SIGNAL: ${asset.name} - MH=${latestMarketHealth.toFixed(2)}%, Momentum=${tokenMomentum.toFixed(2)}%`);

                const buySuccess = await executeBuyOrder(asset.mint, strategyConfig.tradeAmountUSDC, currentPrice);
                if (!buySuccess) {
                    logger.error(`    └─ ❌ Failed to execute buy order after all retries`);
                }
            } else {
                logger.info(`    └─ ❌ Golden Cross NOT confirmed - ${decision.reason} - HOLD`);
            }

            await sleep(API_DELAYS.RATE_LIMIT);
        } catch (error) {
            logger.error(`  ${asset.name}: Error - ${getErrorMessage(error)}`);
            await sleep(API_DELAYS.RATE_LIMIT);
            continue;
        }
    }

    logger.info(`[1-Min Check] Completed - Buy signals: ${buySignals}`);
    return buySignals;
}

/**
 * v2.12.1: Combined 1-minute loop for positions and token momentum
 * Checks positions AND token momentum every minute when MH > 0.1
 */
async function positionMonitoringLoop() {
    while (true) {
        try {
            // 1. Check existing positions for trailing stops
            const openPositions = getOpenPositions();
            if (openPositions.length > 0) {
                logger.info(`[Position Monitor] Checking ${openPositions.length} open positions...`);
                await checkOpenPositions();
            }

            // 2. Check token momentum for new buy opportunities (when MH > 0.1)
            // This runs every minute to catch fast-moving tokens using 1-min candles
            await checkTokenMomentumForBuy();

        } catch (error) {
            logger.error('[Position Monitor] Error in 1-minute loop:', getErrorMessage(error));
        }

        await sleep(POSITION_CHECK_INTERVAL);
    }
}

async function main() {
    try {
        // Validate environment variables
        logger.info('Validating environment configuration...');
        validateEnvironment();

        // Initialize shutdown handlers
        logger.info('Initializing graceful shutdown handlers...');
        ShutdownManager.initialize();

        logger.info('🚀🚀🚀 Trading Bot Started (v2 with Market Filter) 🚀🚀🚀');

        // Initialize trader and load persisted positions
        await initializeTrader();

        // Load asset states (previous BULLISH/BEARISH states)
        loadAssetStates();

        // Initialize Telegram command handlers
        initializeCommandHandlers();

        sendMessage('✅ **Bot Started v2 (with Market Filter)**\nThe bot is online and running.\n\nType `/help` for available commands.');

        // Start position monitoring loop in background
        positionMonitoringLoop().catch(error => {
            logger.error('[Position Monitor] Fatal error:', getErrorMessage(error));
        });

        while (true) {
            const cycleStartTime = Date.now();

            try {
                // Mark the start of this cycle for log tracking BEFORE any logs
                markCycleStart();

                logger.info('--- New analysis cycle started ---');

                // Calculate raw Market Health
                const rawMarketHealth = await calculateMarketHealth();

                // Add to history (maintain max size)
                mhHistory.push({ timestamp: new Date(), mh: rawMarketHealth });
                if (mhHistory.length > MH_HISTORY_SIZE) {
                    mhHistory.shift(); // Remove oldest
                }

                // v2.12.1: Store raw MH for 1-minute momentum checks
                // Token momentum checking now runs every 1 minute (not every 5 minutes)
                latestMarketHealth = rawMarketHealth;

                executionCycleCounter++;
                logger.info(`Execution cycle number ${executionCycleCounter}.`);
                logger.info(`Market Health: ${rawMarketHealth.toFixed(2)}% - ${rawMarketHealth >= 0.1 ? 'Token momentum checking ACTIVE (1-min intervals)' : 'Token checking PAUSED (bearish market)'}`);

                // Send analysis summary after each cycle (with log file)
                const openPositions = getOpenPositions();
                await sendAnalysisSummary({
                    marketHealth: rawMarketHealth,
                    rawMarketHealth: rawMarketHealth,
                    assetsAnalyzed: assetsToTrade.length,
                    buySignals: 0, // v2.12.1: Buy signals now come from 1-min loop, not 5-min cycle
                    openPositions: openPositions.length,
                    cycleNumber: executionCycleCounter
                });

                if (executionCycleCounter >= BOT_CONSTANTS.HEARTBEAT_CYCLE_COUNT) {
                    const openPositions = getOpenPositions();

                    // Include performance metrics in heartbeat
                    const metrics = PerformanceMetrics.getSummary();
                    sendMessage(
                        `❤️ **Heartbeat**\n` +
                        `Bot is still active.\n` +
                        `Open positions: ${openPositions.length}\n` +
                        `Market Index: \`${rawMarketHealth.toFixed(2)}\`\n` +
                        `Uptime: ${metrics.uptime}\n` +
                        `API Success Rate: ${metrics.apiCalls.successRate}`
                    );

                    // Log performance metrics
                    PerformanceMetrics.logSummary();

                    executionCycleCounter = 0;
                }

                // Record cycle execution time
                const cycleDuration = Date.now() - cycleStartTime;
                PerformanceMetrics.recordAnalysisLoop(cycleDuration);

                logger.info(`--- Analysis cycle finished. Sleeping for ${BOT_EXECUTION_INTERVAL / 1000 / 60} minutes... ---`);
            } catch (error) {
                const errorMsg = getErrorMessage(error);
                const errorCtx = getErrorContext(error);

                logger.error('💥 Unexpected error in main loop:', errorCtx);
                PerformanceMetrics.recordError(errorMsg);

                sendMessage('❌ **CRITICAL ERROR!**\nThe bot encountered an unexpected error. Check the logs.');
            }

            await sleep(BOT_EXECUTION_INTERVAL);
        }
    } catch (startupError) {
        const errorMsg = getErrorMessage(startupError);
        logger.error('Failed to start bot:', getErrorContext(startupError));
        sendMessage(`🛑 **Bot Failed to Start**\n${errorMsg}`);
        process.exit(1);
    }
}

main();