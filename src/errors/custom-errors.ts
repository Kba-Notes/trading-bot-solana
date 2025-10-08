// src/errors/custom-errors.ts

/**
 * Base class for all custom trading bot errors
 */
export class TradingBotError extends Error {
    constructor(message: string, public readonly context?: Record<string, any>) {
        super(message);
        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Thrown when API calls fail after all retries
 */
export class APIError extends TradingBotError {
    constructor(
        message: string,
        public readonly apiName: string,
        public readonly statusCode?: number,
        context?: Record<string, any>
    ) {
        super(message, { ...context, apiName, statusCode });
    }
}

/**
 * Thrown when input validation fails
 */
export class ValidationError extends TradingBotError {
    constructor(
        message: string,
        public readonly fieldName: string,
        public readonly value: any,
        context?: Record<string, any>
    ) {
        super(message, { ...context, fieldName, value });
    }
}

/**
 * Thrown when swap/trade execution fails
 */
export class TradeExecutionError extends TradingBotError {
    constructor(
        message: string,
        public readonly assetMint: string,
        public readonly tradeType: 'BUY' | 'SELL',
        context?: Record<string, any>
    ) {
        super(message, { ...context, assetMint, tradeType });
    }
}

/**
 * Thrown when required environment variables are missing
 */
export class ConfigurationError extends TradingBotError {
    constructor(message: string, public readonly missingVars?: string[]) {
        super(message, { missingVars });
    }
}

/**
 * Thrown when blockchain operations fail
 */
export class BlockchainError extends TradingBotError {
    constructor(
        message: string,
        public readonly operation: string,
        context?: Record<string, any>
    ) {
        super(message, { ...context, operation });
    }
}

/**
 * Thrown when data persistence operations fail
 */
export class PersistenceError extends TradingBotError {
    constructor(
        message: string,
        public readonly operation: 'SAVE' | 'LOAD',
        context?: Record<string, any>
    ) {
        super(message, { ...context, operation });
    }
}

/**
 * Type guard to check if error is a TradingBotError
 */
export function isTradingBotError(error: unknown): error is TradingBotError {
    return error instanceof TradingBotError;
}

/**
 * Safely extracts error message from unknown error type
 */
export function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    return 'Unknown error';
}

/**
 * Extracts full error context for logging
 */
export function getErrorContext(error: unknown): Record<string, any> {
    if (isTradingBotError(error)) {
        return {
            name: error.name,
            message: error.message,
            context: error.context,
            stack: error.stack
        };
    }
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
            stack: error.stack
        };
    }
    return { error: String(error) };
}
