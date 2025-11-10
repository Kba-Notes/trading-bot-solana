// src/state/assetStates.ts
// Manages the trend state (BULLISH/BEARISH) for each asset across cycles

import fs from 'fs';
import path from 'path';
import { logger } from '../services.js';

const STATE_FILE = path.join(process.cwd(), 'data', 'assetStates.json');

type TrendState = 'BULLISH' | 'BEARISH';

interface AssetStates {
    [assetMint: string]: TrendState;
}

let stateCache: AssetStates = {};

/**
 * Load asset states from disk
 */
export function loadAssetStates(): void {
    try {
        if (fs.existsSync(STATE_FILE)) {
            const data = fs.readFileSync(STATE_FILE, 'utf-8');
            stateCache = JSON.parse(data);
            logger.info(`Loaded asset states for ${Object.keys(stateCache).length} assets`);
        } else {
            stateCache = {};
            logger.info('No existing asset states found, starting fresh');
        }
    } catch (error: any) {
        logger.error(`Error loading asset states: ${error.message}`);
        stateCache = {};
    }
}

/**
 * Save asset states to disk
 */
function saveAssetStates(): void {
    try {
        const dir = path.dirname(STATE_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(STATE_FILE, JSON.stringify(stateCache, null, 2));
    } catch (error: any) {
        logger.error(`Error saving asset states: ${error.message}`);
    }
}

/**
 * Get the previous state for an asset (defaults to BEARISH if not found)
 */
export function getPreviousState(assetMint: string): TrendState {
    return stateCache[assetMint] || 'BEARISH';
}

/**
 * Update the current state for an asset
 */
export function updateState(assetMint: string, newState: TrendState): void {
    stateCache[assetMint] = newState;
    saveAssetStates();
}

/**
 * Reset an asset's state to BEARISH (called when we sell)
 */
export function resetState(assetMint: string): void {
    stateCache[assetMint] = 'BEARISH';
    saveAssetStates();
    logger.info(`Reset state for ${assetMint} to BEARISH`);
}
