import 'dotenv/config';
import { sendMessage, sendTradeNotification } from '../notifier/telegram.js';

console.log('--- Iniciando Pruebas del Módulo Notificador ---');

// Prueba 1: Mensaje de texto simple
console.log('\n[Prueba 1: Enviando mensaje de estado]');
sendMessage('🤖 El bot de trading se está iniciando...');

// Prueba 2: Notificación de trading simulada
console.log('\n[Prueba 2: Enviando notificación de compra]');
sendTradeNotification({
    asset: 'BONK',
    action: 'COMPRA',
    price: 0.000025,
    reason: 'Golden Cross (SMA 12/26) y RSI > 50'
});

console.log('\n--- Pruebas finalizadas. Revisa tu Telegram para ver los mensajes. ---');