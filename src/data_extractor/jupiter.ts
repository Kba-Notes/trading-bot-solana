// src/data_extractor/jupiter.ts
import 'dotenv/config';
import axios from 'axios';
import { logger } from '../services.js';
import { retryWithBackoff, sleep } from '../utils/async.js';
import { BOT_CONSTANTS, API_DELAYS } from '../constants.js';

/**
 * Gets the most recent price of a token using Jupiter's price endpoint.
 * Includes automatic retry logic with exponential backoff.
 *
 * @param mintAddress The address of the token to query.
 * @returns The current price in USDC or null if there's an error.
 */
export async function getCurrentPrice(mintAddress: string): Promise<number | null> {
    try {
        return await retryWithBackoff(async () => {
            const url = `https://lite-api.jup.ag/price/v3/?ids=${mintAddress}`;
            const response = await axios.get(url);

            // Debug line - shows complete API response
            console.log("Complete API response:", JSON.stringify(response.data, null, 2));

            const data = response.data;
            if (data && data[mintAddress]) {
                return data[mintAddress].usdPrice;
            }

            throw new Error(`Price not found for ${mintAddress} in API response`);
        });
    } catch (error: any) {
        logger.error(`Error in getCurrentPrice for ${mintAddress}:`, error.response?.data || error.message);
        return null;
    }
}

/**
 * Gets a series of historical closing prices using GeckoTerminal API.
 * Uses pool address to fetch OHLCV data for DEX-traded tokens.
 *
 * @param geckoPoolAddress The GeckoTerminal pool address
 * @param timeframe The timeframe of the candles ('minute', 'hour', 'day')
 * @param limit The number of closing prices to retrieve
 * @returns An array of numbers (closing prices) or an empty array if there's an error
 */
export async function getHistoricalData(geckoPoolAddress: string, timeframe: '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w', limit: number): Promise<number[]> {
    try {
        // Map timeframe to GeckoTerminal format
        const geckoTimeframe = timeframe === '1h' ? 'hour' : timeframe === '1d' ? 'day' : 'minute';

        return await retryWithBackoff(async () => {
            // GeckoTerminal API with versioning (Beta API - setting version header)
            const url = `https://api.geckoterminal.com/api/v2/networks/solana/pools/${geckoPoolAddress}/ohlcv/${geckoTimeframe}`;

            const response = await axios.get(url, {
                headers: {
                    'Accept': 'application/json;version=20230302' // Set API version
                }
            });

            if (response.data && response.data.data && response.data.data.attributes && response.data.data.attributes.ohlcv_list) {
                // OHLCV format: [timestamp, open, high, low, close, volume]
                // We only need close prices (index 4)
                const ohlcvList = response.data.data.attributes.ohlcv_list;
                return ohlcvList.map((candle: any[]) => candle[4]).slice(-limit);
            }
            throw new Error(`No historical data returned for pool ${geckoPoolAddress}`);
        });
    } catch (error: any) {
        logger.error(`Error fetching historical data from GeckoTerminal for pool ${geckoPoolAddress}:`, error.message);
        return [];
    }
}

/**
 * v2.19.0: Gets historical closing prices AND volumes using GeckoTerminal API.
 * Used for volume confirmation in entry signals.
 *
 * @param geckoPoolAddress The GeckoTerminal pool address
 * @param timeframe The timeframe of the candles ('minute', 'hour', 'day')
 * @param limit The number of candles to retrieve
 * @returns An object with prices and volumes arrays, or empty arrays if there's an error
 */
export async function getHistoricalDataWithVolume(
    geckoPoolAddress: string,
    timeframe: '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w',
    limit: number
): Promise<{ prices: number[]; volumes: number[] }> {
    try {
        // Map timeframe to GeckoTerminal format
        const geckoTimeframe = timeframe === '1h' ? 'hour' : timeframe === '1d' ? 'day' : 'minute';

        return await retryWithBackoff(async () => {
            // GeckoTerminal API with versioning (Beta API - setting version header)
            const url = `https://api.geckoterminal.com/api/v2/networks/solana/pools/${geckoPoolAddress}/ohlcv/${geckoTimeframe}`;

            const response = await axios.get(url, {
                headers: {
                    'Accept': 'application/json;version=20230302' // Set API version
                }
            });

            if (response.data && response.data.data && response.data.data.attributes && response.data.data.attributes.ohlcv_list) {
                // OHLCV format: [timestamp, open, high, low, close, volume]
                // Extract close prices (index 4) and volumes (index 5)
                const ohlcvList = response.data.data.attributes.ohlcv_list;
                const recentData = ohlcvList.slice(-limit);

                return {
                    prices: recentData.map((candle: any[]) => candle[4]),
                    volumes: recentData.map((candle: any[]) => candle[5])
                };
            }
            throw new Error(`No historical data returned for pool ${geckoPoolAddress}`);
        });
    } catch (error: any) {
        logger.error(`Error fetching historical data with volume from GeckoTerminal for pool ${geckoPoolAddress}:`, error.message);
        return { prices: [], volumes: [] };
    }
}