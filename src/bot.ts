// src/bot.ts

import { logger } from './services.js';
import { assetsToTrade, strategyConfig, BOT_EXECUTION_INTERVAL, USDC_MINT, marketFilterConfig } from './config.js';
import { getHistoricalData as getJupiterHistoricalData, getCurrentPrice } from './data_extractor/jupiter.js';
import { runStrategy } from './strategy_analyzer/logic.js';
import { executeBuyOrder, executeSellOrder, getOpenPositions } from './order_executor/trader.js';
import { sendMessage } from './notifier/telegram.js';
import { SMA } from 'technicalindicators';
import axios from 'axios';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
let executionCycleCounter = 0;

// --- NUEVA FUNCIÓN: Obtiene datos desde CoinGecko ---
async function getCoingeckoHistoricalData(id: string): Promise<number[]> {
    try {
        const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=30&interval=daily`;
        const response = await axios.get(url);
        if (response.data && response.data.prices) {
            return response.data.prices.map((priceEntry: [number, number]) => priceEntry[1]);
        }
        return [];
    } catch (error: any) {
        logger.error(`Error al obtener datos de CoinGecko para ${id}:`, error.message);
        return [];
    }
}

// --- FUNCIÓN MODIFICADA: Usa Birdeye para datos de SOL ---
async function getBirdeyeHistoricalData(mint: string): Promise<number[]> {
    try {
        const thirtyDaysAgo = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
        const now = Math.floor(Date.now() / 1000);
        const url = `https://public-api.birdeye.so/defi/history_price?address=${mint}&address_type=token&type=1D&time_from=${thirtyDaysAgo}&time_to=${now}`;
        const headers = {'X-API-KEY': process.env.BIRDEYE_API_KEY};
        const response = await axios.get(url, { headers });
        if (response.data && response.data.data.items) {
            return response.data.data.items.map((item: any) => item.value);
        }
        return [];
    } catch (error: any) {
        logger.error(`Error al obtener datos de Birdeye para ${mint}:`, error.message);
        return [];
    }
}

async function calculateMarketHealth(): Promise<number> {
    let weightedDistanceSum = 0;
    logger.info('Calculando Índice de Salud de Mercado...');

    for (const asset of marketFilterConfig.assets) {
        let prices: number[] = [];
        if (asset.name === 'SOL') {
            prices = await getBirdeyeHistoricalData(asset.id);
        } else { // Para BTC y ETH
            prices = await getCoingeckoHistoricalData(asset.id);
        }

        if (prices.length < marketFilterConfig.indicatorPeriod) {
            logger.warn(`Datos insuficientes para ${asset.name} en el filtro de mercado.`);
            return 0; // Si un activo falla, el filtro es inválido por seguridad.
        }

        const currentPrice = prices[prices.length - 1];
        const sma = SMA.calculate({ period: marketFilterConfig.indicatorPeriod, values: prices }).pop()!;
        
        const distance = ((currentPrice - sma) / sma) * 100;
        weightedDistanceSum += distance * asset.weight;

        logger.info(`  - ${asset.name}: Precio=${currentPrice.toFixed(2)}, SMA20=${sma.toFixed(2)}, Distancia=${distance.toFixed(2)}%`);
        // Aumentamos la pausa para ser respetuosos con las APIs gratuitas
        await sleep(2000); 
    }
    logger.info(`Índice de Salud de Mercado Final: ${weightedDistanceSum.toFixed(2)}`);
    return weightedDistanceSum;
}

async function checkOpenPositions() {
    const openPositions = getOpenPositions();
    if (openPositions.length === 0) return;

    logger.info(`Revisando ${openPositions.length} posiciones abiertas...`);

    for (const position of openPositions) {
        const assetConfig = assetsToTrade.find(a => a.mint === position.asset);
        if (!assetConfig) continue;

        const currentPrice = await getCurrentPrice(position.asset, USDC_MINT); 
        if (currentPrice === null) {
            logger.warn(`No se pudo obtener el precio actual para ${assetConfig.name}, no se puede verificar la posición.`);
            continue;
        }

        const takeProfitPrice = position.entryPrice * (1 + strategyConfig.takeProfitPercentage);
        const stopLossPrice = position.entryPrice * (1 - strategyConfig.stopLossPercentage);

        let shouldSell = false;
        if (currentPrice >= takeProfitPrice) {
            logger.info(`¡TAKE PROFIT alcanzado para ${assetConfig.name}!`);
            shouldSell = true;
        } else if (currentPrice <= stopLossPrice) {
            logger.info(`¡STOP LOSS alcanzado para ${assetConfig.name}!`);
            shouldSell = true;
        }

        if (shouldSell) {
            await executeSellOrder(position);
        }
        await sleep(1100);
    }
}

/**
 * Busca nuevas oportunidades de compra en la lista de activos.
 */
async function findNewOpportunities(marketHealthIndex: number) {
    const openPositions = getOpenPositions();
    logger.info('Buscando nuevas oportunidades de compra...');

    if (marketHealthIndex <= 0) {
        logger.info('Filtro de mercado negativo. Compras deshabilitadas para este ciclo.');
        return;
    }

    for (const asset of assetsToTrade) {
        if (openPositions.some(p => p.asset === asset.mint)) {
            logger.info(`Ya existe una posición para ${asset.name}, saltando...`);
            continue;
        }

        const historicalPrices = await getJupiterHistoricalData(asset.mint, strategyConfig.timeframe, strategyConfig.historicalDataLimit);
        if (historicalPrices.length < 50) {
            logger.warn(`Datos históricos insuficientes para ${asset.name}, saltando...`);
            await sleep(1100);
            continue;
        }
        
        const { decision, indicators } = runStrategy(historicalPrices, marketHealthIndex);

        // --- NUEVO: Logging Detallado ---
        if (indicators) {
            logger.info(`[Análisis de Activo]: ${asset.name}`);
            logger.info(`[Datos Técnicos]: SMA12=${indicators.sma12.toFixed(8)} | SMA26=${indicators.sma26.toFixed(8)} | RSI14=${indicators.rsi14.toFixed(2)}`);
            logger.info(`[Decisión]: ${decision.action}. Motivo: ${decision.reason}`);
        }
        // --- FIN del Logging Detallado ---

        if (decision.action === 'BUY') {
            const currentPrice = await getCurrentPrice(asset.mint, USDC_MINT);
            if (currentPrice) {
                await executeBuyOrder(asset.mint, strategyConfig.tradeAmountUSDC, currentPrice);
            } else {
                logger.error(`No se pudo obtener el precio para ejecutar la compra de ${asset.name}`);
            }
        }
        await sleep(1100);
    }
}

async function main() {
    logger.info('🚀🚀🚀 Bot de Trading Iniciado (v2 con Filtro de Mercado) 🚀🚀🚀');
    sendMessage('✅ **Bot Iniciado v2 (con Filtro)**\nEl bot está online y funcionando.');
    
    while (true) {
        try {
            logger.info('--- Nuevo ciclo de análisis iniciado ---');
            
            const marketHealthIndex = await calculateMarketHealth();

            await checkOpenPositions();

            await findNewOpportunities(marketHealthIndex);

            executionCycleCounter++;
            logger.info(`Ciclo de ejecución número ${executionCycleCounter}.`);
            
            if (executionCycleCounter >= 6) {
                const openPositions = getOpenPositions();
                sendMessage(`❤️ **Heartbeat**\nEl bot sigue activo.\nPosiciones abiertas: ${openPositions.length}\nÍndice de Mercado: \`${marketHealthIndex.toFixed(2)}\``);
                executionCycleCounter = 0;
            }

            logger.info(`--- Ciclo de análisis finalizado. Durmiendo por ${BOT_EXECUTION_INTERVAL / 1000 / 60} minutos... ---`);
        } catch (error) {
            logger.error('💥 Ha ocurrido un error inesperado en el bucle principal:', error);
            sendMessage('❌ **¡ERROR CRÍTICO!**\nEl bot ha sufrido un error inesperado. Revisa los logs.');
        }
        
        await sleep(BOT_EXECUTION_INTERVAL);
    }
}

main();