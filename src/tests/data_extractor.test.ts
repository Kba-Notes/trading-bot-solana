import { getCurrentPrice, getHistoricalData } from '../data_extractor/jupiter.js';

// Direcciones de tokens que usaremos para las pruebas
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const BONK_MINT = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';


async function runTests() {
  console.log('--- Iniciando Pruebas del Extractor de Datos ---');

  // Prueba 1: Obtener precio actual
  console.log('\n[Prueba 1: Obteniendo precio actual de SOL/USDC]');
  const currentPrice = await getCurrentPrice(SOL_MINT, USDC_MINT);
  if (currentPrice !== null) {
    console.log(`✅ Éxito. Precio actual de SOL: ${currentPrice} USDC`);
  } else {
    console.log('❌ Error en la Prueba 1.');
  }

  // Prueba 2: Obtener datos históricos
  console.log('\n[Prueba 2: Obteniendo los últimos 50 precios de cierre de BONK en 4h]');
  const historicalPrices = await getHistoricalData(BONK_MINT, '4h', 50);
  if (historicalPrices.length > 0) {
    console.log(`✅ Éxito. Se obtuvieron ${historicalPrices.length} precios de cierre.`);
    console.log('Mostrando el precio de cierre más reciente:');
    console.log(historicalPrices[historicalPrices.length - 1]);
  } else {
    console.log('❌ Error en la Prueba 2.');
  }

  console.log('\n--- Pruebas del Extractor de Datos Finalizadas ---');
}

runTests().catch(error => {
    console.error("💥 ERROR FATAL EN EL SCRIPT DE PRUEBA:", error);
});