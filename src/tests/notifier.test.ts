import 'dotenv/config';
import { sendMessage, sendTradeNotification } from '../notifier/telegram.js';

console.log('--- Starting Notifier Module Tests ---');

// Test 1: Simple text message
console.log('\n[Test 1: Sending status message]');
sendMessage('🤖 The trading bot is starting...');

// Test 2: Simulated trading notification
console.log('\n[Test 2: Sending buy notification]');
sendTradeNotification({
    asset: 'BONK',
    action: 'BUY',
    price: 0.000025,
    reason: 'Golden Cross (SMA 12/26) and RSI > 50'
});

console.log('\n--- Tests completed. Check your Telegram to see the messages. ---');