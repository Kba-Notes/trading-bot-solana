// src/bot.ts

import { logger } from './services.js';
import { assetsToTrade, strategyConfig, BOT_EXECUTION_INTERVAL, POSITION_CHECK_INTERVAL, USDC_MINT, marketFilterConfig } from './config.js';
import { getHistoricalData as getJupiterHistoricalData, getCurrentPrice } from './data_extractor/jupiter.js';
import { runStrategy } from './strategy_analyzer/logic.js';
import { executeBuyOrder, executeSellOrder, getOpenPositions, initializeTrader } from './order_executor/trader.js';
import { sendMessage, sendAnalysisSummary, sendPositionCheck, markCycleStart } from './notifier/telegram.js';
import { SMA } from 'technicalindicators';
import axios from 'axios';
import { sleep, executeWithTiming } from './utils/async.js';
import { API_DELAYS, BOT_CONSTANTS } from './constants.js';
import { validateEnvironment } from './config/env-validator.js';
import { ShutdownManager } from './utils/shutdown.js';
import { PerformanceMetrics } from './monitoring/metrics.js';
import { GoldenCrossStrategy } from './strategy/GoldenCrossStrategy.js';
import { getErrorMessage, getErrorContext } from './errors/custom-errors.js';

let executionCycleCounter = 0;
const strategy = new GoldenCrossStrategy({
    shortSMAPeriod: strategyConfig.shortSMAPeriod,
    longSMAPeriod: strategyConfig.longSMAPeriod,
    rsiPeriod: strategyConfig.rsiPeriod,
    rsiThreshold: strategyConfig.rsiThreshold
});

// Fetches historical price data from CoinGecko
async function getCoingeckoHistoricalData(id: string): Promise<number[]> {
    try {
        const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${BOT_CONSTANTS.MARKET_HEALTH_HISTORY_DAYS}&interval=daily`;
        const response = await axios.get(url);
        if (response.data && response.data.prices) {
            return response.data.prices.map((priceEntry: [number, number]) => priceEntry[1]);
        }
        return [];
    } catch (error: any) {
        logger.error(`Error fetching CoinGecko data for ${id}:`, error.message);
        return [];
    }
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
    logger.info('Calculating Market Health Index...');

    for (const asset of marketFilterConfig.assets) {
        // Use CoinGecko for all assets (BTC, ETH, SOL)
        const prices = await getCoingeckoHistoricalData(asset.id);

        if (prices.length < marketFilterConfig.indicatorPeriod) {
            logger.warn(`Insufficient data for ${asset.name} in market filter.`);
            return 0; // If an asset fails, filter is invalid for safety
        }

        const currentPrice = prices[prices.length - 1];
        const sma = SMA.calculate({ period: marketFilterConfig.indicatorPeriod, values: prices }).pop()!;

        const distance = ((currentPrice - sma) / sma) * 100;
        weightedDistanceSum += distance * asset.weight;

        logger.info(`  - ${asset.name}: Price=${currentPrice.toFixed(2)}, SMA20=${sma.toFixed(2)}, Distance=${distance.toFixed(2)}%`);
        // Pause to be respectful with free APIs
        await sleep(API_DELAYS.MARKET_DATA_API);
    }
    logger.info(`Final Market Health Index: ${weightedDistanceSum.toFixed(2)}`);
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

        // Log position status with P&L
        logger.info(`[Position Monitor] ${assetConfig.name}: Entry=$${position.entryPrice.toFixed(6)}, Current=$${currentPrice.toFixed(6)}, P&L=${pnlSign}${pnlPercent.toFixed(2)}% (${pnlSign}$${pnlUSDC.toFixed(2)})`);

        const takeProfitPrice = position.entryPrice * (1 + strategyConfig.takeProfitPercentage);
        const stopLossPrice = position.entryPrice * (1 - strategyConfig.stopLossPercentage);

        // Trailing stop logic: Activate when in 2% profit
        const profitThreshold = position.entryPrice * 1.02;

        // Check if we should activate trailing stop
        if (currentPrice >= profitThreshold && !position.trailingStopActive) {
            position.trailingStopActive = true;
            position.highestPrice = currentPrice;
            logger.info(`🔒 Trailing stop activated for ${assetConfig.name} at $${currentPrice.toFixed(6)}`);
        }

        // If trailing stop is active, monitor it regardless of current price level
        if (position.trailingStopActive) {
            // Update highest price if current is higher
            position.highestPrice = Math.max(position.highestPrice || currentPrice, currentPrice);

            // Trail 3% below highest price (increased from 2% to reduce premature exits)
            const trailingStopPrice = position.highestPrice * 0.97;

            // Log trailing stop status
            logger.info(`[Trailing Stop] ${assetConfig.name}: High=$${position.highestPrice.toFixed(6)}, Trail Stop=$${trailingStopPrice.toFixed(6)}, Current=$${currentPrice.toFixed(6)}`);

            if (currentPrice < trailingStopPrice) {
                logger.info(`🎯 Trailing stop hit for ${assetConfig.name}! High: $${position.highestPrice.toFixed(6)}, Current: $${currentPrice.toFixed(6)}`);
                await executeSellOrder(position);
                await sleep(API_DELAYS.RATE_LIMIT);
                continue;
            }
        }

        let shouldSell = false;
        let sellReason = '';

        if (currentPrice >= takeProfitPrice) {
            logger.info(`🎯 TAKE PROFIT reached for ${assetConfig.name}! Target: $${takeProfitPrice.toFixed(6)}, Current: $${currentPrice.toFixed(6)}`);
            shouldSell = true;
            sellReason = 'Take Profit';
        } else if (currentPrice <= stopLossPrice) {
            logger.info(`⛔ STOP LOSS reached for ${assetConfig.name}! Stop: $${stopLossPrice.toFixed(6)}, Current: $${currentPrice.toFixed(6)}`);
            shouldSell = true;
            sellReason = 'Stop Loss';
        } else {
            // Log distance to targets if not trailing
            if (!position.trailingStopActive) {
                const distanceToTP = ((takeProfitPrice - currentPrice) / currentPrice) * 100;
                const distanceToSL = ((currentPrice - stopLossPrice) / currentPrice) * 100;
                logger.info(`[Targets] ${assetConfig.name}: TP=${distanceToTP.toFixed(2)}% away, SL=${distanceToSL.toFixed(2)}% away`);
            }
        }

        if (shouldSell) {
            await executeSellOrder(position);
        }
        await sleep(API_DELAYS.RATE_LIMIT);
    }
}

/**
 * Searches for new buy opportunities in the asset list.
 */
async function findNewOpportunities(marketHealthIndex: number) {
    const openPositions = getOpenPositions();
    logger.info('Searching for new buy opportunities...');

    if (marketHealthIndex <= 0) {
        logger.info('Negative market filter. Buying disabled for this cycle.');
        return 0; // Return buy signals count
    }

    let buySignals = 0;

    for (const asset of assetsToTrade) {
        if (openPositions.some(p => p.asset === asset.mint)) {
            logger.info(`Position already exists for ${asset.name}, skipping...`);
            continue;
        }

        const historicalPrices = await getJupiterHistoricalData(asset.geckoPool, strategyConfig.timeframe, strategyConfig.historicalDataLimit);
        if (historicalPrices.length < BOT_CONSTANTS.MIN_HISTORICAL_DATA_POINTS) {
            logger.warn(`Insufficient historical data for ${asset.name}, skipping...`);
            await sleep(API_DELAYS.RATE_LIMIT);
            continue;
        }

        const { decision, indicators } = runStrategy(historicalPrices, marketHealthIndex);

        // Detailed logging
        if (indicators) {
            logger.info(`[Asset Analysis]: ${asset.name}`);
            logger.info(`[Technical Data]: SMA12=${indicators.sma12.toFixed(8)} | SMA26=${indicators.sma26.toFixed(8)} | RSI14=${indicators.rsi14.toFixed(2)}`);
            logger.info(`[Decision]: ${decision.action}. Reason: ${decision.reason}`);
        }

        if (decision.action === 'BUY') {
            buySignals++;
            const currentPrice = await getCurrentPrice(asset.mint);
            if (currentPrice) {
                await executeBuyOrder(asset.mint, strategyConfig.tradeAmountUSDC, currentPrice);
            } else {
                logger.error(`Could not get price to execute buy for ${asset.name}`);
            }
        }
        await sleep(API_DELAYS.RATE_LIMIT);
    }

    return buySignals;
}

/**
 * Lightweight position monitoring loop - runs every 15 minutes
 * Only checks positions when they exist (no market analysis)
 */
async function positionMonitoringLoop() {
    while (true) {
        try {
            const openPositions = getOpenPositions();
            if (openPositions.length > 0) {
                logger.info(`[Position Monitor] Checking ${openPositions.length} open positions...`);
                await checkOpenPositions();
            }
        } catch (error) {
            logger.error('[Position Monitor] Error checking positions:', getErrorMessage(error));
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

        sendMessage('✅ **Bot Started v2 (with Market Filter)**\nThe bot is online and running.');

        // Start position monitoring loop in background
        positionMonitoringLoop().catch(error => {
            logger.error('[Position Monitor] Fatal error:', getErrorMessage(error));
        });

        while (true) {
            const cycleStartTime = Date.now();

            try {
                logger.info('--- New analysis cycle started ---');

                // Mark the start of this cycle for log tracking
                markCycleStart();

                const marketHealthIndex = await calculateMarketHealth();

                await checkOpenPositions();

                const buySignals = await findNewOpportunities(marketHealthIndex);

                executionCycleCounter++;
                logger.info(`Execution cycle number ${executionCycleCounter}.`);

                // Send analysis summary after each cycle (with log file)
                const openPositions = getOpenPositions();
                await sendAnalysisSummary({
                    marketHealth: marketHealthIndex,
                    assetsAnalyzed: assetsToTrade.length,
                    buySignals,
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
                        `Market Index: \`${marketHealthIndex.toFixed(2)}\`\n` +
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