// src/config/env-validator.ts

import { ConfigurationError } from '../errors/custom-errors.js';

/**
 * Required environment variables for the bot to function
 */
const REQUIRED_ENV_VARS = [
    'PRIVATE_KEY',
    'BIRDEYE_API_KEY',
    'TELEGRAM_TOKEN',
    'TELEGRAM_CHAT_ID'
] as const;

/**
 * Optional environment variables with default values
 */
const OPTIONAL_ENV_VARS = {
    NODE_ENV: 'production',
    LOG_LEVEL: 'info'
} as const;

/**
 * Validates that all required environment variables are present
 * and properly formatted.
 *
 * @throws ConfigurationError if required variables are missing
 *
 * @example
 * validateEnvironment(); // Call at bot startup
 */
export function validateEnvironment(): void {
    const missingVars: string[] = [];

    for (const varName of REQUIRED_ENV_VARS) {
        if (!process.env[varName]) {
            missingVars.push(varName);
        }
    }

    if (missingVars.length > 0) {
        throw new ConfigurationError(
            'Missing required environment variables: ' + missingVars.join(', '),
            missingVars
        );
    }

    // Validate PRIVATE_KEY format (should be base58)
    const privateKey = process.env.PRIVATE_KEY!;
    if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(privateKey)) {
        throw new ConfigurationError(
            'PRIVATE_KEY appears to have invalid format (expected base58 string)'
        );
    }

    // Validate TELEGRAM_CHAT_ID is numeric
    const chatId = process.env.TELEGRAM_CHAT_ID!;
    if (!/^-?\d+$/.test(chatId)) {
        throw new ConfigurationError(
            'TELEGRAM_CHAT_ID must be a numeric value'
        );
    }

    // Set defaults for optional vars
    for (const [key, defaultValue] of Object.entries(OPTIONAL_ENV_VARS)) {
        if (!process.env[key]) {
            process.env[key] = defaultValue;
        }
    }
}

/**
 * Gets environment variable value with type checking
 *
 * @param key The environment variable name
 * @param defaultValue Optional default value if not set
 * @returns The environment variable value
 *
 * @example
 * const logLevel = getEnvVar('LOG_LEVEL', 'info');
 */
export function getEnvVar(key: string, defaultValue?: string): string {
    const value = process.env[key];
    if (value === undefined) {
        if (defaultValue !== undefined) {
            return defaultValue;
        }
        throw new ConfigurationError(`Environment variable ${key} is not set`);
    }
    return value;
}

/**
 * Checks if running in production environment
 */
export function isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
}

/**
 * Checks if running in development environment
 */
export function isDevelopment(): boolean {
    return process.env.NODE_ENV === 'development';
}
