// src/notifier/telegram.ts
import { logger, bot, chatId } from '../services.js';

/**
 * Sends a text message via Telegram bot.
 */
export function sendMessage(message: string) {
    logger.info(`Attempting to send to Telegram: "${message.substring(0, 50)}..."`);

    if (bot && chatId) {
        bot.sendMessage(chatId, message, { parse_mode: 'Markdown' }).catch((error: any) => {
            logger.error("Error sending Telegram message:", { error: error.message });
        });
    } else {
        logger.warn(`[NOTIFICATION (Telegram disabled)]: ${message}`);
    }
}

// Interface for trade operation details
interface TradeDetails {
    asset: string;
    action: 'BUY' | 'SELL';
    price: number;
    reason?: string;
    pnl?: number; // Profit/Loss (optional)
}

/**
 * Formats and sends a trading operation notification.
 */
export function sendTradeNotification(details: TradeDetails) {
    const icon = details.action === 'BUY' ? '📈' : '📉';
    let message = `
*${icon} New Trade: ${details.action}*

*Asset:* \`${details.asset}\`
*Price:* \`${details.price.toFixed(6)}\``;

    if (details.reason) {
        message += `\n*Reason:* ${details.reason}`;
    }

    if (details.pnl !== undefined) {
        const pnlIcon = details.pnl >= 0 ? '🟢' : '🔴';
        message += `\n*Profit/Loss:* ${pnlIcon} \`$${details.pnl.toFixed(2)}\` USDC`;
    }

    sendMessage(message);
}