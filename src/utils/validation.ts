/**
 * @module utils/validation
 * 
 * Input validation functions to ensure data integrity and prevent errors.
 */

import { TRADING_LIMITS, SOLANA_CONSTANTS } from '../constants.js';
import { ValidationError } from '../errors/custom-errors.js';

/**
 * Validates a Solana address (mint address, wallet address, etc.)
 *
 * @param address The address to validate
 * @param fieldName Name of the field for error message
 * @throws ValidationError if address is invalid
 *
 * @example
 * validateSolanaAddress(assetMint, 'assetMint');
 */
export function validateSolanaAddress(address: string, fieldName: string = 'address'): void {
    if (!address || typeof address !== 'string') {
        throw new ValidationError(
            fieldName + ' is required and must be a string',
            fieldName,
            address
        );
    }

    if (address.length < SOLANA_CONSTANTS.MIN_ADDRESS_LENGTH) {
        throw new ValidationError(
            fieldName + ' is too short (minimum ' + SOLANA_CONSTANTS.MIN_ADDRESS_LENGTH + ' characters)',
            fieldName,
            address,
            { minLength: SOLANA_CONSTANTS.MIN_ADDRESS_LENGTH }
        );
    }

    // Basic alphanumeric check (Solana addresses are base58)
    if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(address)) {
        throw new ValidationError(
            fieldName + ' contains invalid characters',
            fieldName,
            address
        );
    }
}

/**
 * Validates a trade amount in USDC
 *
 * @param amount The amount to validate
 * @param fieldName Name of the field for error message
 * @throws ValidationError if amount is invalid
 *
 * @example
 * validateTradeAmount(500, 'amountUSDC');
 */
export function validateTradeAmount(amount: number, fieldName: string = 'amount'): void {
    if (typeof amount !== 'number' || isNaN(amount)) {
        throw new ValidationError(
            fieldName + ' must be a valid number',
            fieldName,
            amount
        );
    }

    if (!isFinite(amount)) {
        throw new ValidationError(
            fieldName + ' must be finite',
            fieldName,
            amount
        );
    }

    if (amount <= 0) {
        throw new ValidationError(
            fieldName + ' must be positive',
            fieldName,
            amount
        );
    }

    if (amount < TRADING_LIMITS.MIN_TRADE_AMOUNT_USDC) {
        throw new ValidationError(
            fieldName + ' is below minimum (' + TRADING_LIMITS.MIN_TRADE_AMOUNT_USDC + ' USDC)',
            fieldName,
            amount,
            { min: TRADING_LIMITS.MIN_TRADE_AMOUNT_USDC }
        );
    }

    if (amount > TRADING_LIMITS.MAX_TRADE_AMOUNT_USDC) {
        throw new ValidationError(
            fieldName + ' exceeds maximum (' + TRADING_LIMITS.MAX_TRADE_AMOUNT_USDC + ' USDC)',
            fieldName,
            amount,
            { max: TRADING_LIMITS.MAX_TRADE_AMOUNT_USDC }
        );
    }
}

/**
 * Validates a price value
 *
 * @param price The price to validate
 * @param fieldName Name of the field for error message
 * @throws ValidationError if price is invalid
 *
 * @example
 * validatePrice(0.45, 'price');
 */
export function validatePrice(price: number, fieldName: string = 'price'): void {
    if (typeof price !== 'number' || isNaN(price)) {
        throw new ValidationError(
            fieldName + ' must be a valid number',
            fieldName,
            price
        );
    }

    if (!isFinite(price)) {
        throw new ValidationError(
            fieldName + ' must be finite',
            fieldName,
            price
        );
    }

    if (price <= 0) {
        throw new ValidationError(
            fieldName + ' must be positive',
            fieldName,
            price
        );
    }
}

/**
 * Validates the number of open positions
 *
 * @param count Current number of open positions
 * @throws ValidationError if limit exceeded
 *
 * @example
 * validatePositionLimit(openPositions.length);
 */
export function validatePositionLimit(count: number): void {
    if (count >= TRADING_LIMITS.MAX_OPEN_POSITIONS) {
        throw new ValidationError(
            'Maximum open positions limit reached (' +
            TRADING_LIMITS.MAX_OPEN_POSITIONS +
            ')',
            'openPositions',
            count,
            { limit: TRADING_LIMITS.MAX_OPEN_POSITIONS }
        );
    }
}
