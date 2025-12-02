// src/notifier/commandHandler.ts
import { logger, bot, chatId } from '../services.js';
import { getOpenPositions, executeSellOrder, executeBuyOrder } from '../order_executor/trader.js';
import { getCurrentPrice } from '../data_extractor/jupiter.js';
import { assetsToTrade, strategyConfig } from '../config.js';
import { getLatestMarketHealth, isTradingPaused, setTradingPaused } from '../bot.js';
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
    const marketHealth = getLatestMarketHealth();

    if (positions.length === 0) {
        return `📊 *Current Status*\n\n🌡️ *Market Health:* ${marketHealth.toFixed(2)}\n💼 No open positions`;
    }

    let status = `📊 *Current Status*\n\n🌡️ *Market Health:* ${marketHealth.toFixed(2)}\n💼 *Open Positions:* ${positions.length}\n\n`;

    for (const position of positions) {
        const assetConfig = assetsToTrade.find(a => a.mint === position.asset);
        const assetName = assetConfig?.name || 'Unknown';

        const currentPrice = await getCurrentPrice(position.asset);
        if (!currentPrice) continue;

        // Determine decimal places based on price magnitude (same as logs)
        const decimals = currentPrice < 0.01 ? 8 : 6;

        const pnlPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
        const pnlUSDC = (currentPrice - position.entryPrice) * (position.amount / position.entryPrice);
        const pnlSign = pnlPercent >= 0 ? '+' : '';
        const pnlEmoji = pnlPercent >= 0 ? '🟢' : '🔴';

        status += `${pnlEmoji} *${assetName}*\n`;
        status += `  Entry: \`$${position.entryPrice.toFixed(decimals)}\`\n`;
        status += `  Current: \`$${currentPrice.toFixed(decimals)}\`\n`;
        status += `  P&L: \`${pnlSign}${pnlPercent.toFixed(2)}%\` (${pnlSign}$${pnlUSDC.toFixed(2)})\n`;

        if (position.trailingStopActive && position.highestPrice) {
            // v2.12.0: Fixed 2.5% trailing stop (no longer dynamic)
            const trailingStopPercent = 0.025; // Fixed 2.5%
            const trailingStopPrice = position.highestPrice * (1 - trailingStopPercent);
            const potentialPnlPercent = ((trailingStopPrice - position.entryPrice) / position.entryPrice) * 100;
            const potentialPnlUSDC = (trailingStopPrice - position.entryPrice) * (position.amount / position.entryPrice);
            const potentialPnlSign = potentialPnlPercent >= 0 ? '+' : '';

            status += `  🎯 Trailing: \`$${trailingStopPrice.toFixed(decimals)}\` (2.5% fixed)\n`;
            status += `  💰 Potential P&L: \`${potentialPnlSign}${potentialPnlPercent.toFixed(2)}%\` (${potentialPnlSign}$${potentialPnlUSDC.toFixed(2)})\n`;
            status += `  📈 Highest: \`$${position.highestPrice.toFixed(decimals)}\`\n`;
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

    // /sell command - manually sell a position
    bot.onText(/^\/sell\s+([A-Za-z0-9]+)$/i, async (msg, match) => {
        // Only respond to authorized chat
        if (msg.chat.id.toString() !== chatId) {
            logger.warn(`Unauthorized command attempt from chat ID: ${msg.chat.id}`);
            return;
        }

        if (!match || !match[1]) {
            bot?.sendMessage(chatId, '⚠️ Invalid format.\n\nUsage: `/sell <TOKEN>`\nExample: `/sell JUP`', { parse_mode: 'Markdown' });
            return;
        }

        const tokenName = match[1].toUpperCase();
        logger.info(`Received /sell command from user for token: ${tokenName}`);

        try {
            // Find the asset configuration
            const assetConfig = assetsToTrade.find(a => a.name.toUpperCase() === tokenName);
            if (!assetConfig) {
                const availableTokens = assetsToTrade.map(a => a.name).join(', ');
                bot?.sendMessage(chatId, `⚠️ Unknown token: *${tokenName}*\n\nAvailable tokens: ${availableTokens}`, { parse_mode: 'Markdown' });
                return;
            }

            // Find the open position
            const positions = getOpenPositions();
            const position = positions.find(p => p.asset === assetConfig.mint);

            if (!position) {
                bot?.sendMessage(chatId, `⚠️ No open position found for *${tokenName}*\n\nUse \`/status\` to see current positions.`, { parse_mode: 'Markdown' });
                return;
            }

            // Get current price for confirmation message
            const currentPrice = await getCurrentPrice(position.asset);
            if (!currentPrice) {
                bot?.sendMessage(chatId, `❌ Failed to get current price for *${tokenName}*. Cannot execute manual sell.`, { parse_mode: 'Markdown' });
                return;
            }

            const decimals = currentPrice < 0.01 ? 8 : 6;
            const pnlPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
            const pnlUSDC = (currentPrice - position.entryPrice) * (position.amount / position.entryPrice);
            const pnlSign = pnlPercent >= 0 ? '+' : '';

            // Send confirmation that sell is being executed
            bot?.sendMessage(chatId, `🔄 *Manual Sell Initiated*\n\nToken: ${tokenName}\nEntry: $${position.entryPrice.toFixed(decimals)}\nCurrent: $${currentPrice.toFixed(decimals)}\nEstimated P&L: ${pnlSign}${pnlPercent.toFixed(2)}% (${pnlSign}$${pnlUSDC.toFixed(2)})\n\n_Executing sell order..._`, { parse_mode: 'Markdown' });

            // Execute the sell order
            logger.info(`Executing manual sell order for ${tokenName} (position ID: ${position.id})`);
            const success = await executeSellOrder(position);

            if (success) {
                logger.info(`✅ Manual sell order completed successfully for ${tokenName}`);
                // Note: executeSellOrder already sends trade notification
            } else {
                logger.error(`❌ Manual sell order failed for ${tokenName}`);
                bot?.sendMessage(chatId, `❌ *Manual Sell Failed*\n\nToken: ${tokenName}\n\nPlease check logs for details. The position may still be open.`, { parse_mode: 'Markdown' });
            }
        } catch (error) {
            logger.error('Error handling /sell command:', error);
            bot?.sendMessage(chatId, '❌ Error executing manual sell. Check bot logs for details.');
        }
    });

    // /buy command - manually buy a token
    bot.onText(/^\/buy\s+([A-Za-z0-9]+)$/i, async (msg, match) => {
        // Only respond to authorized chat
        if (msg.chat.id.toString() !== chatId) {
            logger.warn(`Unauthorized command attempt from chat ID: ${msg.chat.id}`);
            return;
        }

        if (!match || !match[1]) {
            bot?.sendMessage(chatId, '⚠️ Invalid format.\n\nUsage: `/buy <TOKEN>`\nExample: `/buy JUP`', { parse_mode: 'Markdown' });
            return;
        }

        const tokenName = match[1].toUpperCase();
        logger.info(`Received /buy command from user for token: ${tokenName}`);

        try {
            // Check if trading is paused
            if (isTradingPaused()) {
                bot?.sendMessage(chatId, '⚠️ *Trading is PAUSED*\n\nUse `/start` to resume trading before buying.', { parse_mode: 'Markdown' });
                return;
            }

            // Find the asset configuration
            const assetConfig = assetsToTrade.find(a => a.name.toUpperCase() === tokenName);
            if (!assetConfig) {
                const availableTokens = assetsToTrade.map(a => a.name).join(', ');
                bot?.sendMessage(chatId, `⚠️ Unknown token: *${tokenName}*\n\nAvailable tokens: ${availableTokens}`, { parse_mode: 'Markdown' });
                return;
            }

            // Check if position already exists
            const positions = getOpenPositions();
            const existingPosition = positions.find(p => p.asset === assetConfig.mint);

            if (existingPosition) {
                bot?.sendMessage(chatId, `⚠️ Position already exists for *${tokenName}*\n\nUse \`/status\` to see current positions.\nUse \`/sell ${tokenName}\` to close the position first.`, { parse_mode: 'Markdown' });
                return;
            }

            // Get current price for confirmation message
            const currentPrice = await getCurrentPrice(assetConfig.mint);
            if (!currentPrice) {
                bot?.sendMessage(chatId, `❌ Failed to get current price for *${tokenName}*. Cannot execute manual buy.`, { parse_mode: 'Markdown' });
                return;
            }

            const decimals = currentPrice < 0.01 ? 8 : 6;
            const amount = strategyConfig.tradeAmountUSDC;

            // Send confirmation that buy is being executed
            bot?.sendMessage(chatId, `🔄 *Manual Buy Initiated*\n\nToken: ${tokenName}\nPrice: $${currentPrice.toFixed(decimals)}\nAmount: ${amount} USDC\n\n_Executing buy order..._`, { parse_mode: 'Markdown' });

            // Execute the buy order
            logger.info(`Executing manual buy order for ${tokenName}`);
            const success = await executeBuyOrder(assetConfig.mint, amount, currentPrice, `MANUAL (via /buy command)`);

            if (success) {
                logger.info(`✅ Manual buy order completed successfully for ${tokenName}`);
                // Note: executeBuyOrder already sends trade notification
            } else {
                logger.error(`❌ Manual buy order failed for ${tokenName}`);
                bot?.sendMessage(chatId, `❌ *Manual Buy Failed*\n\nToken: ${tokenName}\n\nPlease check logs for details. No position was opened.`, { parse_mode: 'Markdown' });
            }
        } catch (error) {
            logger.error('Error handling /buy command:', error);
            bot?.sendMessage(chatId, '❌ Error executing manual buy. Check bot logs for details.');
        }
    });

    // /stop command - pause trading
    bot.onText(/^\/stop$/, (msg) => {
        // Only respond to authorized chat
        if (msg.chat.id.toString() !== chatId) {
            logger.warn(`Unauthorized command attempt from chat ID: ${msg.chat.id}`);
            return;
        }

        logger.info('Received /stop command from user');

        if (isTradingPaused()) {
            bot?.sendMessage(chatId, '⚠️ Trading is already paused.\n\nUse `/start` to resume.', { parse_mode: 'Markdown' });
            return;
        }

        setTradingPaused(true);
        bot?.sendMessage(chatId, `⏸️ *Trading PAUSED*\n\n✅ No new buy signals will be processed\n✅ Open positions still monitored\n✅ Trailing stops still active\n✅ Telegram commands still work\n\nUse \`/start\` to resume trading.`, { parse_mode: 'Markdown' });
    });

    // /start command - resume trading
    bot.onText(/^\/start$/, (msg) => {
        // Only respond to authorized chat
        if (msg.chat.id.toString() !== chatId) {
            logger.warn(`Unauthorized command attempt from chat ID: ${msg.chat.id}`);
            return;
        }

        logger.info('Received /start command from user');

        if (!isTradingPaused()) {
            bot?.sendMessage(chatId, '✅ Trading is already active.\n\nUse `/stop` to pause.', { parse_mode: 'Markdown' });
            return;
        }

        setTradingPaused(false);
        bot?.sendMessage(chatId, `▶️ *Trading RESUMED*\n\n✅ Buy signals will be processed\n✅ Bot will check momentum every minute\n✅ All strategies active\n\nUse \`/stop\` to pause trading.`, { parse_mode: 'Markdown' });
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

💵 */buy <TOKEN>* - Manually buy a token
  • \`/buy JUP\` - Buy JUP with configured amount
  • \`/buy WIF\` - Buy WIF with configured amount
  • Shows price and amount before executing

💰 */sell <TOKEN>* - Manually sell a position
  • \`/sell JUP\` - Sell open JUP position
  • \`/sell WIF\` - Sell open WIF position
  • Shows current P&L before executing

⏸️ */stop* - Pause trading
  • Stops processing new buy signals
  • Positions still monitored and protected
  • Telegram commands still work

▶️ */start* - Resume trading
  • Resumes processing buy signals
  • Re-enables all strategies

❓ */help* - Show this help message

_Note: Only you can use these commands (chat ID verified)_
`;

        bot?.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
    });

    logger.info('Command handlers initialized successfully');
}
