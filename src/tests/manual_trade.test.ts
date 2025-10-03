// src/tests/manual_trade.test.ts
import { executeBuyOrder, getOpenPositions } from '../order_executor/trader.js';
import { logger } from '../services.js';

const ASSET_TO_TEST = 'BONK';
const MINT_ADDRESS = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
const TRADE_AMOUNT = 500;
// Usamos un precio de entrada realista pero ficticio para la prueba
const FAKE_ENTRY_PRICE = 0.000025; 

async function runManualTradeTest() {
    logger.info(`--- INYECTANDO ORDEN DE COMPRA MANUAL PARA ${ASSET_TO_TEST} ---`);

    const initialPositions = getOpenPositions();
    if (initialPositions.some(p => p.asset === MINT_ADDRESS)) {
        logger.error(`Ya existe una posición abierta para ${ASSET_TO_TEST}. Cierra la posición existente antes de inyectar una nueva.`);
        return;
    }

    await executeBuyOrder(MINT_ADDRESS, TRADE_AMOUNT, FAKE_ENTRY_PRICE);

    const finalPositions = getOpenPositions();
    logger.info(`Posición inyectada. Posiciones abiertas ahora: ${finalPositions.length}`);
    logger.info('Ahora, observa los logs del bot principal con "pm2 logs trading-bot" en el siguiente ciclo.');
}

runManualTradeTest().catch(error => {
    logger.error("💥 ERROR FATAL EN EL SCRIPT DE TRADE MANUAL:", error);
});