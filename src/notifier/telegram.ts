// src/notifier/telegram.ts
import { logger, bot, chatId } from '../services.js';
import fs from 'fs';
import path from 'path';

// Store the start time of current analysis cycle for log extraction
let currentCycleStartTime: Date | null = null;

/**
 * Marks the start of a new analysis cycle for log tracking
 * Subtracts 1 second to ensure we capture all logs (since log timestamps have second precision)
 */
export function markCycleStart() {
    const now = new Date();
    // Subtract 1 second to ensure we capture logs from the same second
    currentCycleStartTime = new Date(now.getTime() - 1000);
}

/**
 * Extracts logs from the current cycle and saves to a temp file
 * @returns Path to the temp file containing cycle logs, or null if failed
 */
async function extractCycleLogs(): Promise<string | null> {
    if (!currentCycleStartTime) {
        logger.warn('Cannot extract cycle logs: cycle start time not set');
        return null;
    }

    try {
        const logFilePath = path.join(process.cwd(), 'trading-bot.log');
        const tempLogPath = path.join(process.cwd(), 'temp-cycle-log.txt');

        // Read the log file
        const logContent = await fs.promises.readFile(logFilePath, 'utf-8');
        const logLines = logContent.split('\n');

        // Filter logs from current cycle
        const cycleLogs: string[] = [];
        const cycleStartTimestamp = currentCycleStartTime.toISOString().split('T')[0]; // YYYY-MM-DD format

        for (const line of logLines) {
            if (!line.trim()) continue;

            try {
                const logEntry = JSON.parse(line);
                const logTime = new Date(logEntry.timestamp);

                // Include logs from current cycle onwards
                if (logTime >= currentCycleStartTime) {
                    // Format for readability
                    const formattedLine = `[${logEntry.timestamp}] ${logEntry.level.toUpperCase()}: ${logEntry.message}`;
                    cycleLogs.push(formattedLine);
                }
            } catch (parseError) {
                // Skip malformed lines
                continue;
            }
        }

        if (cycleLogs.length === 0) {
            logger.warn('No logs found for current cycle');
            return null;
        }

        // Add header
        const header = `=== Analysis Cycle Logs ===\nCycle Start: ${currentCycleStartTime.toLocaleString()}\nTotal Log Entries: ${cycleLogs.length}\n\n`;
        const fileContent = header + cycleLogs.join('\n');

        // Write to temp file
        await fs.promises.writeFile(tempLogPath, fileContent, 'utf-8');

        return tempLogPath;
    } catch (error) {
        logger.error('Failed to extract cycle logs:', error);
        return null;
    }
}

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
    amount?: number; // Trade amount in USDC
    reason?: string;
    pnl?: number; // Profit/Loss (optional)
    percentage?: number; // P&L percentage
    entryPrice?: number; // For sell notifications
    indicators?: {
        sma12?: number;
        sma26?: number;
        rsi?: number;
        marketHealth?: number;
    };
}

// Interface for analysis cycle notifications
interface AnalysisUpdate {
    marketHealth: number;
    assetsAnalyzed: number;
    buySignals: number;
    openPositions: number;
    cycleNumber: number;
}

/**
 * Formats and sends a trading operation notification.
 */
export function sendTradeNotification(details: TradeDetails) {
    const icon = details.action === 'BUY' ? '🟢 BUY' : '🔴 SELL';
    let message = `*${icon} - ${details.asset}*\n`;

    if (details.action === 'BUY') {
        message += `\n💰 *Entry Price:* \`$${details.price.toFixed(6)}\``;

        if (details.amount) {
            message += `\n💵 *Amount:* \`$${details.amount.toFixed(2)}\` USDC`;
        }

        if (details.indicators) {
            message += `\n\n📊 *Technical Indicators:*`;
            if (details.indicators.sma12) {
                message += `\n  • SMA12: \`${details.indicators.sma12.toFixed(6)}\``;
            }
            if (details.indicators.sma26) {
                message += `\n  • SMA26: \`${details.indicators.sma26.toFixed(6)}\``;
            }
            if (details.indicators.rsi) {
                message += `\n  • RSI(14): \`${details.indicators.rsi.toFixed(2)}\``;
            }
            if (details.indicators.marketHealth) {
                message += `\n  • Market Health: \`${details.indicators.marketHealth.toFixed(2)}%\``;
            }
        }

        if (details.reason) {
            message += `\n\n✅ *Signal:* ${details.reason}`;
        }

    } else {
        // SELL notification
        message += `\n💰 *Exit Price:* \`$${details.price.toFixed(6)}\``;

        if (details.entryPrice) {
            message += `\n📍 *Entry Price:* \`$${details.entryPrice.toFixed(6)}\``;
        }

        if (details.amount) {
            message += `\n💵 *Amount:* \`$${details.amount.toFixed(2)}\` USDC`;
        }

        if (details.pnl !== undefined) {
            const pnlIcon = details.pnl >= 0 ? '🟢' : '🔴';
            const pnlSign = details.pnl >= 0 ? '+' : '';
            message += `\n\n${pnlIcon} *P&L:* \`${pnlSign}$${details.pnl.toFixed(2)}\` USDC`;

            if (details.percentage !== undefined) {
                message += ` (${pnlSign}${details.percentage.toFixed(2)}%)`;
            }
        }

        if (details.reason) {
            message += `\n\n📌 *Reason:* ${details.reason}`;
        }
    }

    sendMessage(message);
}

/**
 * Sends analysis cycle summary notification with log file attachment
 */
export async function sendAnalysisSummary(update: AnalysisUpdate) {
    const healthIcon = update.marketHealth > 0 ? '🟢' : '🔴';
    const message = `
📊 *Analysis Cycle #${update.cycleNumber}*

${healthIcon} *Market Health:* \`${update.marketHealth.toFixed(2)}%\`
🔍 *Assets Analyzed:* \`${update.assetsAnalyzed}\`
📈 *Buy Signals:* \`${update.buySignals}\`
💼 *Open Positions:* \`${update.openPositions}\`

_Next analysis in 1 hour..._
`;

    // Send the summary message
    sendMessage(message);

    // Extract and send cycle logs as document
    try {
        const logFilePath = await extractCycleLogs();

        if (logFilePath && bot && chatId) {
            const fileName = `cycle-${update.cycleNumber}-${new Date().toISOString().split('T')[0]}.txt`;

            await bot.sendDocument(chatId, logFilePath, {
                caption: `📄 Detailed logs for Analysis Cycle #${update.cycleNumber}`
            }, {
                filename: fileName,
                contentType: 'text/plain'
            });

            logger.info(`Sent cycle log file: ${fileName}`);

            // Clean up temp file
            try {
                await fs.promises.unlink(logFilePath);
            } catch (cleanupError) {
                logger.warn('Failed to cleanup temp log file:', cleanupError);
            }
        }
    } catch (error) {
        logger.error('Failed to send cycle log file:', error);
        // Don't fail the whole function if log sending fails
    }
}

/**
 * Sends position check notification
 */
export function sendPositionCheck(positionsChecked: number, actionsTaken: number) {
    if (actionsTaken > 0) {
        const message = `
🔍 *Position Check Complete*

✅ Checked \`${positionsChecked}\` open positions
⚡ Actions taken: \`${actionsTaken}\`
`;
        sendMessage(message);
    }
}

/**
 * Sends strategy decision notification (for transparency)
 */
export function sendStrategyDecision(asset: string, decision: string, indicators: any) {
    const message = `
🤖 *Strategy Decision - ${asset}*

📊 *Decision:* ${decision}

*Indicators:*
  • SMA12: \`${indicators.sma12?.toFixed(6) || 'N/A'}\`
  • SMA26: \`${indicators.sma26?.toFixed(6) || 'N/A'}\`
  • RSI: \`${indicators.rsi?.toFixed(2) || 'N/A'}\`
`;

    // Only send if not HOLD to avoid spam
    if (decision !== 'HOLD') {
        sendMessage(message);
    }
}