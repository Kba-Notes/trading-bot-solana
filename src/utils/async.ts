/**
 * @module utils/async
 * 
 * Utility functions for asynchronous operations including retry logic,
 * delays, and error handling.
 */

import { logger } from '../services.js';
import { RETRY_CONFIG } from '../constants.js';

/**
 * Simple sleep function using promises
 * @param ms Milliseconds to sleep
 */
export const sleep = (ms: number): Promise<void> => 
    new Promise(resolve => setTimeout(resolve, ms));

/**
 * Retries an async function with exponential backoff
 * 
 * @template T Return type of the function
 * @param fn Function to retry
 * @param maxRetries Maximum number of attempts (default: 3)
 * @param baseDelay Initial delay in ms, doubles each retry (default: 1000ms)
 * @returns Promise resolving to the function result
 * @throws Error if all retry attempts fail
 * 
 * @example
 * const price = await retryWithBackoff(
 *   () => getCurrentPrice(mint),
 *   3,
 *   1000
 * );
 */
export async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = RETRY_CONFIG.MAX_RETRIES,
    baseDelay: number = RETRY_CONFIG.BASE_DELAY
): Promise<T> {
    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error as Error;
            
            if (attempt < maxRetries - 1) {
                const delay = Math.min(
                    baseDelay * Math.pow(2, attempt),
                    RETRY_CONFIG.MAX_DELAY
                );
                
                logger.warn('Operation failed, retrying...', {
                    attempt: attempt + 1,
                    maxRetries,
                    retryInMs: delay,
                    error: lastError.message
                });
                
                await sleep(delay);
            }
        }
    }
    
    const errorMessage = lastError ? lastError.message : 'Unknown error';
    throw new Error('Operation failed after ' + maxRetries + ' attempts: ' + errorMessage);
}

/**
 * Executes an async function and logs its execution time
 * 
 * @template T Return type of the function
 * @param name Name of the operation for logging
 * @param fn Function to execute
 * @returns Promise resolving to the function result
 * 
 * @example
 * const price = await executeWithTiming(
 *   'getCurrentPrice',
 *   () => getCurrentPrice(mint)
 * );
 */
export async function executeWithTiming<T>(
    name: string,
    fn: () => Promise<T>
): Promise<T> {
    const start = Date.now();
    
    try {
        const result = await fn();
        const duration = Date.now() - start;
        
        logger.debug('Operation completed', {
            operation: name,
            durationMs: duration
        });
        
        return result;
    } catch (error) {
        const duration = Date.now() - start;
        const err = error as Error;
        
        logger.error('Operation failed', {
            operation: name,
            durationMs: duration,
            error: err.message
        });
        
        throw error;
    }
}
