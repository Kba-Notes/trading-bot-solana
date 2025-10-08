/**
 * @module persistence/positions
 * 
 * Handles persistence of open trading positions to disk.
 * This ensures positions are not lost on bot restarts.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../services.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../../data');
const POSITIONS_FILE = path.join(DATA_DIR, 'positions.json');

export interface OpenPosition {
    id: number;
    asset: string;
    entryPrice: number;
    amount: number;
    timestamp: Date;
}

/**
 * Saves open positions to disk as JSON
 * 
 * @param positions Array of open positions to save
 * @throws Error if unable to write to disk
 * 
 * @example
 * await savePositions(openPositions);
 */
export async function savePositions(positions: OpenPosition[]): Promise<void> {
    try {
        // Ensure data directory exists
        await fs.mkdir(DATA_DIR, { recursive: true });
        
        // Write positions to file
        await fs.writeFile(
            POSITIONS_FILE,
            JSON.stringify(positions, null, 2),
            'utf-8'
        );
        
        logger.debug('Positions saved to disk', {
            count: positions.length,
            file: POSITIONS_FILE
        });
    } catch (error) {
        const err = error as Error;
        logger.error('Failed to save positions', {
            error: err.message,
            file: POSITIONS_FILE
        });
        throw new Error('Position persistence failed: ' + err.message);
    }
}

/**
 * Loads open positions from disk
 * 
 * @returns Array of open positions (empty if file doesn't exist)
 * @throws Error if file exists but cannot be read or parsed
 * 
 * @example
 * const positions = await loadPositions();
 */
export async function loadPositions(): Promise<OpenPosition[]> {
    try {
        const data = await fs.readFile(POSITIONS_FILE, 'utf-8');
        const positions = JSON.parse(data) as OpenPosition[];
        
        // Convert timestamp strings back to Date objects
        const hydratedPositions = positions.map(p => ({
            ...p,
            timestamp: new Date(p.timestamp)
        }));
        
        logger.info('Positions loaded from disk', {
            count: hydratedPositions.length,
            file: POSITIONS_FILE
        });
        
        return hydratedPositions;
    } catch (error) {
        const err = error as NodeJS.ErrnoException;
        
        // File doesn't exist - this is OK for first run
        if (err.code === 'ENOENT') {
            logger.info('No existing positions file found - starting fresh');
            return [];
        }
        
        // Other errors are problems
        logger.error('Failed to load positions', {
            error: err.message,
            file: POSITIONS_FILE
        });
        throw new Error('Position loading failed: ' + err.message);
    }
}

/**
 * Clears all saved positions from disk
 * Useful for manual cleanup or testing
 * 
 * @example
 * await clearPositions();
 */
export async function clearPositions(): Promise<void> {
    try {
        await fs.unlink(POSITIONS_FILE);
        logger.info('Positions file deleted', { file: POSITIONS_FILE });
    } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err.code !== 'ENOENT') {
            logger.error('Failed to delete positions file', {
                error: err.message
            });
        }
    }
}
