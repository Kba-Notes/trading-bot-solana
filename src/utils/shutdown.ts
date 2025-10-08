// src/utils/shutdown.ts

import { logger } from '../services.js';
import { getOpenPositions } from '../order_executor/trader.js';
import { savePositions } from '../persistence/positions.js';
import { sendMessage } from '../notifier/telegram.js';
import { PerformanceMetrics } from '../monitoring/metrics.js';

type CleanupHandler = () => Promise<void> | void;

/**
 * Manages graceful shutdown of the trading bot
 */
export class ShutdownManager {
    private static cleanupHandlers: CleanupHandler[] = [];
    private static isShuttingDown = false;

    /**
     * Registers a cleanup handler to be called during shutdown
     *
     * @param handler Function to execute during shutdown
     *
     * @example
     * ShutdownManager.registerCleanupHandler(async () => {
     *     await closeDatabase();
     * });
     */
    static registerCleanupHandler(handler: CleanupHandler): void {
        this.cleanupHandlers.push(handler);
    }

    /**
     * Initializes shutdown handlers for common signals
     *
     * @example
     * ShutdownManager.initialize(); // Call at bot startup
     */
    static initialize(): void {
        // Handle SIGTERM (graceful shutdown signal from PM2/Docker)
        process.on('SIGTERM', () => {
            logger.info('Received SIGTERM signal');
            this.shutdown('SIGTERM');
        });

        // Handle SIGINT (Ctrl+C in terminal)
        process.on('SIGINT', () => {
            logger.info('Received SIGINT signal (Ctrl+C)');
            this.shutdown('SIGINT');
        });

        // Handle uncaught exceptions
        process.on('uncaughtException', (error: Error) => {
            logger.error('Uncaught exception:', error);
            this.shutdown('uncaughtException', error);
        });

        // Handle unhandled promise rejections
        process.on('unhandledRejection', (reason: any) => {
            logger.error('Unhandled promise rejection:', reason);
            this.shutdown('unhandledRejection', reason);
        });

        logger.info('Shutdown handlers initialized');
    }

    /**
     * Executes graceful shutdown sequence
     *
     * @param signal The signal that triggered shutdown
     * @param error Optional error that caused shutdown
     */
    private static async shutdown(signal: string, error?: any): Promise<void> {
        if (this.isShuttingDown) {
            logger.warn('Shutdown already in progress...');
            return;
        }

        this.isShuttingDown = true;
        logger.info(`Starting graceful shutdown (${signal})...`);

        try {
            // Save open positions
            logger.info('Saving open positions...');
            const openPositions = getOpenPositions();
            await savePositions(openPositions);
            logger.info(`Saved ${openPositions.length} open positions`);

            // Log performance metrics
            logger.info('Logging final performance metrics...');
            PerformanceMetrics.logSummary();

            // Execute registered cleanup handlers
            logger.info(`Executing ${this.cleanupHandlers.length} cleanup handlers...`);
            for (const handler of this.cleanupHandlers) {
                try {
                    await handler();
                } catch (err) {
                    logger.error('Error in cleanup handler:', err);
                }
            }

            // Send shutdown notification to Telegram
            const errorMsg = error ? `\nError: ${error.message || String(error)}` : '';
            await sendMessage(
                `🛑 **Bot Shutting Down**\nSignal: ${signal}\nOpen positions: ${openPositions.length}${errorMsg}`
            );

            logger.info('Graceful shutdown completed successfully');

            // Exit with appropriate code
            process.exit(error ? 1 : 0);
        } catch (shutdownError) {
            logger.error('Error during graceful shutdown:', shutdownError);
            process.exit(1);
        }
    }

    /**
     * Manually triggers graceful shutdown (useful for testing)
     */
    static async triggerShutdown(): Promise<void> {
        await this.shutdown('manual');
    }
}
