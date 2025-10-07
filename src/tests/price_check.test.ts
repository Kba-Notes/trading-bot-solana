// src/tests/price_check.test.ts
import { getCurrentPrice } from '../data_extractor/jupiter.js';
import { assetsToTrade } from '../config.js';
import { logger } from '../services.js';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function runPriceCheckTest() {
    logger.info('--- 🚀 Iniciando Test de la función getCurrentPrice (con nueva API) ---');

    for (const asset of assetsToTrade) {
        logger.info(`\n[TEST] Comprobando precio para ${asset.name}...`);
        
        // La nueva función solo necesita la dirección 'mint' del activo
        const price = await getCurrentPrice(asset.mint);

        if (price !== null) {
            logger.info(`✅ Éxito para ${asset.name}. Precio obtenido: ${price.toFixed(6)} USDC`);
        } else {
            logger.error(`❌ FALLO para ${asset.name}. No se pudo obtener el precio.`);
        }
        await sleep(1100);
    }

    logger.info('\n--- ✅ Test de Precios Finalizado ---');
}

runPriceCheckTest();