// src/monitoring/metrics.ts

import { logger } from '../services.js';

/**
 * Performance metrics tracker for monitoring bot operations
 */
export class PerformanceMetrics {
    private static metrics = {
        apiCalls: {
            total: 0,
            successful: 0,
            failed: 0,
            byEndpoint: new Map<string, { total: number; successful: number; failed: number }>()
        },
        trades: {
            buys: 0,
            sells: 0,
            failedBuys: 0,
            failedSells: 0
        },
        executionTimes: {
            analysisLoops: [] as number[],
            apiCalls: [] as number[],
            swaps: [] as number[]
        },
        errors: {
            total: 0,
            byType: new Map<string, number>()
        },
        startTime: Date.now()
    };

    /**
     * Records an API call
     *
     * @param endpoint The API endpoint called
     * @param success Whether the call was successful
     * @param durationMs Duration of the call in milliseconds
     */
    static recordAPICall(endpoint: string, success: boolean, durationMs?: number): void {
        this.metrics.apiCalls.total++;

        if (success) {
            this.metrics.apiCalls.successful++;
        } else {
            this.metrics.apiCalls.failed++;
        }

        // Track by endpoint
        const endpointStats = this.metrics.apiCalls.byEndpoint.get(endpoint) || {
            total: 0,
            successful: 0,
            failed: 0
        };

        endpointStats.total++;
        if (success) {
            endpointStats.successful++;
        } else {
            endpointStats.failed++;
        }

        this.metrics.apiCalls.byEndpoint.set(endpoint, endpointStats);

        if (durationMs !== undefined) {
            this.metrics.executionTimes.apiCalls.push(durationMs);
        }
    }

    /**
     * Records a trade execution
     *
     * @param type Trade type (BUY or SELL)
     * @param success Whether the trade was successful
     */
    static recordTrade(type: 'BUY' | 'SELL', success: boolean): void {
        if (type === 'BUY') {
            if (success) {
                this.metrics.trades.buys++;
            } else {
                this.metrics.trades.failedBuys++;
            }
        } else {
            if (success) {
                this.metrics.trades.sells++;
            } else {
                this.metrics.trades.failedSells++;
            }
        }
    }

    /**
     * Records an error occurrence
     *
     * @param errorType The type/name of the error
     */
    static recordError(errorType: string): void {
        this.metrics.errors.total++;
        const count = this.metrics.errors.byType.get(errorType) || 0;
        this.metrics.errors.byType.set(errorType, count + 1);
    }

    /**
     * Records execution time for an analysis loop
     *
     * @param durationMs Duration in milliseconds
     */
    static recordAnalysisLoop(durationMs: number): void {
        this.metrics.executionTimes.analysisLoops.push(durationMs);

        // Keep only last 100 measurements to avoid memory issues
        if (this.metrics.executionTimes.analysisLoops.length > 100) {
            this.metrics.executionTimes.analysisLoops.shift();
        }
    }

    /**
     * Records execution time for a swap operation
     *
     * @param durationMs Duration in milliseconds
     */
    static recordSwapTime(durationMs: number): void {
        this.metrics.executionTimes.swaps.push(durationMs);

        // Keep only last 100 measurements
        if (this.metrics.executionTimes.swaps.length > 100) {
            this.metrics.executionTimes.swaps.shift();
        }
    }

    /**
     * Calculates average from array of numbers
     */
    private static average(arr: number[]): number {
        if (arr.length === 0) return 0;
        return arr.reduce((sum, val) => sum + val, 0) / arr.length;
    }

    /**
     * Gets current uptime in milliseconds
     */
    static getUptime(): number {
        return Date.now() - this.metrics.startTime;
    }

    /**
     * Gets comprehensive metrics summary
     */
    static getSummary(): {
        uptime: string;
        apiCalls: {
            total: number;
            successRate: string;
            avgDuration: string;
        };
        trades: {
            totalSuccessful: number;
            totalFailed: number;
            successRate: string;
        };
        performance: {
            avgAnalysisLoopMs: number;
            avgSwapMs: number;
        };
        errors: {
            total: number;
            topErrors: Array<{ type: string; count: number }>;
        };
    } {
        const uptimeMs = this.getUptime();
        const uptimeHours = Math.floor(uptimeMs / 3600000);
        const uptimeMinutes = Math.floor((uptimeMs % 3600000) / 60000);

        const totalSuccessfulTrades = this.metrics.trades.buys + this.metrics.trades.sells;
        const totalFailedTrades = this.metrics.trades.failedBuys + this.metrics.trades.failedSells;
        const totalTrades = totalSuccessfulTrades + totalFailedTrades;

        const apiSuccessRate = this.metrics.apiCalls.total > 0
            ? ((this.metrics.apiCalls.successful / this.metrics.apiCalls.total) * 100).toFixed(2)
            : 'N/A';

        const tradeSuccessRate = totalTrades > 0
            ? ((totalSuccessfulTrades / totalTrades) * 100).toFixed(2)
            : 'N/A';

        const avgApiDuration = this.average(this.metrics.executionTimes.apiCalls);

        // Get top 5 errors
        const topErrors = Array.from(this.metrics.errors.byType.entries())
            .map(([type, count]) => ({ type, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        return {
            uptime: `${uptimeHours}h ${uptimeMinutes}m`,
            apiCalls: {
                total: this.metrics.apiCalls.total,
                successRate: apiSuccessRate + '%',
                avgDuration: avgApiDuration > 0 ? avgApiDuration.toFixed(0) + 'ms' : 'N/A'
            },
            trades: {
                totalSuccessful: totalSuccessfulTrades,
                totalFailed: totalFailedTrades,
                successRate: tradeSuccessRate + '%'
            },
            performance: {
                avgAnalysisLoopMs: Math.round(this.average(this.metrics.executionTimes.analysisLoops)),
                avgSwapMs: Math.round(this.average(this.metrics.executionTimes.swaps))
            },
            errors: {
                total: this.metrics.errors.total,
                topErrors
            }
        };
    }

    /**
     * Logs metrics summary to console
     */
    static logSummary(): void {
        const summary = this.getSummary();
        logger.info('=== Performance Metrics Summary ===');
        logger.info(`Uptime: ${summary.uptime}`);
        logger.info(`API Calls: ${summary.apiCalls.total} (Success Rate: ${summary.apiCalls.successRate})`);
        logger.info(`Trades: ${summary.trades.totalSuccessful} successful, ${summary.trades.totalFailed} failed (Success Rate: ${summary.trades.successRate})`);
        logger.info(`Performance: Avg loop ${summary.performance.avgAnalysisLoopMs}ms, Avg swap ${summary.performance.avgSwapMs}ms`);
        logger.info(`Errors: ${summary.errors.total} total`);

        if (summary.errors.topErrors.length > 0) {
            logger.info('Top Errors:');
            summary.errors.topErrors.forEach(err => {
                logger.info(`  - ${err.type}: ${err.count}`);
            });
        }
    }

    /**
     * Resets all metrics (useful for testing)
     */
    static reset(): void {
        this.metrics = {
            apiCalls: {
                total: 0,
                successful: 0,
                failed: 0,
                byEndpoint: new Map()
            },
            trades: {
                buys: 0,
                sells: 0,
                failedBuys: 0,
                failedSells: 0
            },
            executionTimes: {
                analysisLoops: [],
                apiCalls: [],
                swaps: []
            },
            errors: {
                total: 0,
                byType: new Map()
            },
            startTime: Date.now()
        };
    }
}
