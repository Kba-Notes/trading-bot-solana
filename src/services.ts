// src/services.ts
import 'dotenv/config';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import TelegramBot from 'node-telegram-bot-api';

// --- 1. LOGGER CONFIGURATION ---
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(info => `${info.timestamp} -> ${info.message}`)
  ),
  transports: [
    new winston.transports.File({
      filename: 'error.log',
      level: 'error',
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(info => `${info.timestamp} -> [ERROR] ${info.message}`)
      )
    }),
    new DailyRotateFile({
      filename: 'trading-bot-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '10m',
      maxFiles: '7d',
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(info => `${info.timestamp} -> ${info.message}`)
      )
    }),
  ],
});

logger.add(new winston.transports.Console({
  format: winston.format.combine(
    winston.format.colorize({ all: true }),
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(info => `[${info.timestamp}] ${info.level}: ${info.message}`)
  )
}));

// --- 2. TELEGRAM BOT CONFIGURATION ---
const token = process.env.TELEGRAM_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

let bot: TelegramBot | null = null;

if (token && chatId) {
    // Enable polling to receive messages
    bot = new TelegramBot(token, { polling: true });
    logger.info('Telegram bot initialized successfully with polling enabled.');
} else {
    logger.warn('Telegram credentials not found. Notifier will be disabled.');
}

// --- 3. SERVICE EXPORTS ---
export { logger, bot, chatId };