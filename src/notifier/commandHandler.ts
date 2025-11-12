// src/notifier/commandHandler.ts
import { logger, bot, chatId } from '../services.js';
import { getOpenPositions } from '../order_executor/trader.js';
import { getCurrentPrice } from '../data_extractor/jupiter.js';
import { assetsToTrade } from '../config.js';
import fs from 'fs';
import path from 'path';

/**
 * Extracts the last N minutes of logs from trading-bot.log
 * @param minutes Number of minutes to look back (default: 1)
 * @returns Path to temp file with logs, or null if failed
 */
async function extractRecentLogs(minutes: number = 1): Promise<string | null> {
    try {
        // Get today's log file with date pattern
        const today = new Date().toISOString().split('T')[0];
        const logFilePath = path.join(process.cwd(), `trading-bot-${today}.log`);
        const tempLogPath = path.join(process.cwd(), 'temp-recent-logs.txt');

        // Read the log file
        const logContent = await fs.promises.readFile(logFilePath, 'utf-8');
        const logLines = logContent.split('\n');

        // Calculate cutoff time
        const cutoffTime = new Date(Date.now() - minutes * 60 * 1000);

        // Filter logs from last N minutes
        const recentLogs: string[] = [];

        for (const line of logLines) {
            if (!line.trim()) continue;

            // Extract timestamp from the beginning of the line
            const timestampMatch = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);

            if (timestampMatch) {
                const logTime = new Date(timestampMatch[1]);

                // Include logs from last N minutes
                if (logTime >= cutoffTime) {
                    recentLogs.push(line);
                }
            }
        }

        if (recentLogs.length === 0) {
            logger.warn(`No logs found for last ${minutes} minute(s)`);
            return null;
        }

        // Add header
        const header = `=== Recent Logs (Last ${minutes} minute${minutes > 1 ? 's' : ''}) ===\nGenerated: ${new Date().toLocaleString()}\nTotal Log Entries: ${recentLogs.length}\n\n`;
        const fileContent = header + recentLogs.join('\n');

        // Write to temp file
        await fs.promises.writeFile(tempLogPath, fileContent, 'utf-8');

        return tempLogPath;
    } catch (error) {
        logger.error('Failed to extract recent logs:', error);
        return null;
    }
}

/**
 * Formats current positions for status display
 */
async function getPositionsStatus(): Promise<string> {
    const positions = getOpenPositions();

    if (positions.length === 0) {
        return '📊 *Current Status*\n\n💼 No open positions';
    }

    let status = `📊 *Current Status*\n\n💼 *Open Positions:* ${positions.length}\n\n`;

    for (const position of positions) {
        const assetConfig = assetsToTrade.find(a => a.mint === position.asset);
        const assetName = assetConfig?.name || 'Unknown';

        const currentPrice = await getCurrentPrice(position.asset);
        if (!currentPrice) continue;

        const pnlPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
        const pnlUSDC = (currentPrice - position.entryPrice) * (position.amount / position.entryPrice);
        const pnlSign = pnlPercent >= 0 ? '+' : '';
        const pnlEmoji = pnlPercent >= 0 ? '🟢' : '🔴';

        status += `${pnlEmoji} *${assetName}*\n`;
        status += `  Entry: \`$${position.entryPrice.toFixed(6)}\`\n`;
        status += `  Current: \`$${currentPrice.toFixed(6)}\`\n`;
        status += `  P&L: \`${pnlSign}${pnlPercent.toFixed(2)}%\` (${pnlSign}$${pnlUSDC.toFixed(2)})\n`;

        if (position.trailingStopActive && position.highestPrice) {
            const trailingStopPrice = position.highestPrice * 0.97;
            const potentialPnlPercent = ((trailingStopPrice - position.entryPrice) / position.entryPrice) * 100;
            const potentialPnlUSDC = (trailingStopPrice - position.entryPrice) * (position.amount / position.entryPrice);
            const potentialPnlSign = potentialPnlPercent >= 0 ? '+' : '';

            status += `  🎯 Trailing: \`$${trailingStopPrice.toFixed(6)}\`\n`;
            status += `  💰 Potential P&L: \`${potentialPnlSign}${potentialPnlPercent.toFixed(2)}%\` (${potentialPnlSign}$${potentialPnlUSDC.toFixed(2)})\n`;
            status += `  📈 Highest: \`$${position.highestPrice.toFixed(6)}\`\n`;
        }

        status += '\n';
    }

    return status;
}

/**
 * Initializes Telegram command handlers
 * Must be called after bot is initialized
 */
export function initializeCommandHandlers(): void {
    if (!bot || !chatId) {
        logger.warn('Cannot initialize command handlers: bot or chatId not configured');
        return;
    }

    logger.info('Initializing Telegram command handlers...');

    // /logs command - sends recent logs
    bot.onText(/^\/logs(?:\s+(\d+))?$/, async (msg, match) => {
        // Only respond to authorized chat
        if (msg.chat.id.toString() !== chatId) {
            logger.warn(`Unauthorized command attempt from chat ID: ${msg.chat.id}`);
            return;
        }

        const minutes = match && match[1] ? parseInt(match[1]) : 1;

        // Validate minutes range (1-60)
        if (minutes < 1 || minutes > 60) {
            bot?.sendMessage(chatId, '⚠️ Invalid time range. Please use 1-60 minutes.\n\nUsage: `/logs [minutes]`\nExample: `/logs 5` for last 5 minutes', { parse_mode: 'Markdown' });
            return;
        }

        logger.info(`Received /logs command from user, extracting last ${minutes} minute(s)...`);

        try {
            const logFilePath = await extractRecentLogs(minutes);

            if (logFilePath && bot && chatId) {
                const fileName = `recent-logs-${new Date().toISOString().split('T')[0]}.txt`;

                await bot.sendDocument(chatId, logFilePath, {
                    caption: `📄 Recent logs (last ${minutes} minute${minutes > 1 ? 's' : ''})`
                }, { filename: fileName, contentType: 'text/plain' });

                // Cleanup temp file
                await fs.promises.unlink(logFilePath);
                logger.info(`Sent recent logs file (${minutes} minute${minutes > 1 ? 's' : ''})`);
            } else {
                bot?.sendMessage(chatId, `⚠️ No logs found for the last ${minutes} minute${minutes > 1 ? 's' : ''}.`);
            }
        } catch (error) {
            logger.error('Error handling /logs command:', error);
            bot?.sendMessage(chatId, '❌ Error extracting logs. Check bot logs for details.');
        }
    });

    // /status command - shows current positions
    bot.onText(/^\/status$/, async (msg) => {
        // Only respond to authorized chat
        if (msg.chat.id.toString() !== chatId) {
            logger.warn(`Unauthorized command attempt from chat ID: ${msg.chat.id}`);
            return;
        }

        logger.info('Received /status command from user');

        try {
            const status = await getPositionsStatus();
            bot?.sendMessage(chatId, status, { parse_mode: 'Markdown' });
        } catch (error) {
            logger.error('Error handling /status command:', error);
            bot?.sendMessage(chatId, '❌ Error getting status. Check bot logs for details.');
        }
    });

    // /help command - shows available commands
    bot.onText(/^\/help$/, (msg) => {
        // Only respond to authorized chat
        if (msg.chat.id.toString() !== chatId) {
            logger.warn(`Unauthorized command attempt from chat ID: ${msg.chat.id}`);
            return;
        }

        logger.info('Received /help command from user');

        const helpText = `
🤖 *Trading Bot Commands*

📄 */logs [minutes]* - Get recent logs
  • \`/logs\` - Last 1 minute (default)
  • \`/logs 5\` - Last 5 minutes
  • \`/logs 60\` - Last 60 minutes (max)

📊 */status* - View current positions
  • Shows all open positions
  • Displays P&L, entry/current prices
  • Shows trailing stop info

❓ */help* - Show this help message

_Note: Only you can use these commands (chat ID verified)_
`;

        bot?.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
    });

    logger.info('Command handlers initialized successfully');
}
