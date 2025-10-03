// src/tests/order_executor.test.ts
import { executeBuyOrder, executeSellOrder, getOpenPositions } from '../order_executor/trader.js';

async function runExecutorTest() {
    console.log('--- Iniciando Pruebas del Ejecutor de Órdenes ---');

    // 1. Estado inicial: la cartera debería estar vacía
    console.log('\n[Paso 1: Verificando estado inicial]');
    let positions = getOpenPositions();
    console.log(`Posiciones abiertas al inicio: ${positions.length}`);
    if (positions.length !== 0) throw new Error("La cartera debería estar vacía al inicio.");
    console.log('✅ Correcto.');

    // 2. Simular una compra
    console.log('\n[Paso 2: Simulando una orden de compra para BONK]');
    await executeBuyOrder('BONK', 500, 0.000025);
    positions = getOpenPositions();
    console.log(`Posiciones abiertas tras la compra: ${positions.length}`);
    if (positions.length !== 1) throw new Error("Debería haber una posición abierta tras la compra.");
    console.log('✅ Correcto. Revisa Telegram para la notificación de compra.');
    
    // 3. Simular una venta
    console.log('\n[Paso 3: Simulando una orden de venta para la posición abierta]');
    const positionToSell = positions[0];
    await executeSellOrder(positionToSell);
    positions = getOpenPositions();
    console.log(`Posiciones abiertas tras la venta: ${positions.length}`);
    if (positions.length !== 0) throw new Error("La cartera debería estar vacía tras la venta.");
    console.log('✅ Correcto.');


    console.log('\n--- Pruebas del Ejecutor de Órdenes Finalizadas ---');
}

runExecutorTest().catch(error => {
    console.error("💥 ERROR FATAL EN EL SCRIPT DE PRUEBA:", error);
});