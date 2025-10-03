// src/services.ts
import 'dotenv/config';
import winston from 'winston';
import TelegramBot from 'node-telegram-bot-api';

// --- 1. CONFIGURACIÓN DEL LOGGER ---
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'trading-bot.log' }),
  ],
});

logger.add(new winston.transports.Console({
  format: winston.format.combine(
    winston.format.colorize({ all: true }),
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(info => `[${info.timestamp}] ${info.level}: ${info.message}`)
  )
}));

// --- 2. CONFIGURACIÓN DEL BOT DE TELEGRAM ---
const token = process.env.TELEGRAM_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

let bot: TelegramBot | null = null;

if (token && chatId) {
    bot = new TelegramBot(token);
    logger.info('Bot de Telegram inicializado correctamente.');
} else {
    logger.warn('Credenciales de Telegram no encontradas. El notificador estará desactivado.');
}

// --- 3. EXPORTACIÓN DE LOS SERVICIOS ---
export { logger, bot, chatId };