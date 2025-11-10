import { getHistoricalData } from '../data_extractor/jupiter.js';
import { calculateIndicators, runStrategy } from '../strategy_analyzer/logic.js';

// Función auxiliar para crear una pausa
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Lista de tokens que queremos probar (actualizada y corregida)
const tokensToTest = [
    { name: 'JUP', mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN' },
    { name: 'JTO', mint: 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL' },
    { name: 'WIF', mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm' },
    { name: 'PENG', mint: '2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv' }, // <-- DIRECCIÓN CORREGIDA
    { name: 'BONK', mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263' },
];

async function runStrategyTest() {
    console.log('--- Iniciando Pruebas del Analizador de Estrategias con Múltiples Activos ---');

    for (const token of tokensToTest) {
        console.log(`\n================== Analizando ${token.name} ==================`);
        
        const historicalPrices = await getHistoricalData(token.mint, '4h', 100);

        if (historicalPrices.length < 50) {
            console.log(`❌ Error: No se obtuvieron suficientes datos para ${token.name}.`);
            await sleep(1100);
            continue; 
        }
        console.log(`✅ Éxito: Se obtuvieron ${historicalPrices.length} precios de cierre.`);

        const indicators = calculateIndicators(historicalPrices);
        if (indicators) {
            console.log('Indicadores calculados:');
            console.log(`  - SMA 12: ${indicators.sma12.toFixed(8)}`);
            console.log(`  - SMA 26: ${indicators.sma26.toFixed(8)}`);
            console.log(`  - RSI 14: ${indicators.rsi14.toFixed(2)}`);
        } else {
            console.log(`❌ Error: No se pudieron calcular los indicadores para ${token.name}.`);
            continue;
        }

        const decision = runStrategy(token.mint, historicalPrices, 1);
        console.log(`Decisión final para ${token.name}:`);
        console.log(decision);
        
        await sleep(1100); 
    }

    console.log('\n--- Pruebas del Analizador de Estrategias Finalizadas ---');
}

runStrategyTest().catch(error => {
    console.error("💥 ERROR FATAL EN EL SCRIPT DE PRUEBA:", error);
});