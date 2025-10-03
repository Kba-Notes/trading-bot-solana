// src/notifier/telegram.ts
import { logger, bot, chatId } from '../services.js';

/**
 * Envía un mensaje de texto a través del bot de Telegram.
 */
export function sendMessage(message: string) {
    logger.info(`Intentando enviar a Telegram: "${message.substring(0, 50)}..."`);

    if (bot && chatId) {
        bot.sendMessage(chatId, message, { parse_mode: 'Markdown' }).catch((error: any) => {
            logger.error("Error al enviar mensaje de Telegram:", { error: error.message });
        });
    } else {
        logger.warn(`[NOTIFICACIÓN (Telegram desactivado)]: ${message}`);
    }
}

// Interfaz para los detalles de una operación
interface TradeDetails {
    asset: string;
    action: 'COMPRA' | 'VENTA';
    price: number;
    reason?: string;
    pnl?: number; // Beneficio/Pérdida (opcional)
}

/**
 * Formatea y envía una notificación de una operación de trading.
 */
export function sendTradeNotification(details: TradeDetails) {
    const icon = details.action === 'COMPRA' ? '📈' : '📉';
    let message = `
*${icon} Nueva Operación: ${details.action}*

*Activo:* \`${details.asset}\`
*Precio:* \`${details.price.toFixed(6)}\``;

    if (details.reason) {
        message += `\n*Motivo:* ${details.reason}`;
    }

    if (details.pnl !== undefined) {
        const pnlIcon = details.pnl >= 0 ? '🟢' : '🔴';
        message += `\n*Beneficio/Pérdida:* ${pnlIcon} \`$${details.pnl.toFixed(2)}\` USDC`;
    }
    
    sendMessage(message);
}