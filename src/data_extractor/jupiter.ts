// src/data_extractor/jupiter.ts
import 'dotenv/config';
import axios from 'axios';
import { logger } from '../services.js';

/**
 * Gets the most recent price of a token using Jupiter's price endpoint.
 * @param mintAddress The address of the token to query.
 * @returns The current price in USDC or null if there's an error.
 */
export async function getCurrentPrice(mintAddress: string): Promise<number | null> {
    try {
        const url = `https://lite-api.jup.ag/price/v3/?ids=${mintAddress}`;

        const response = await axios.get(url);

        // Debug line - shows complete API response
        console.log("Complete API response:", JSON.stringify(response.data, null, 2));

        const data = response.data;
        if (data && data[mintAddress]) {
            return data[mintAddress].usdPrice;
        }

        logger.error(`Price not found for ${mintAddress} in API response`);
        return null;
    } catch (error: any) {
        logger.error(`Error in getCurrentPrice for ${mintAddress}:`, error.response?.data || error.message);
        return null;
    }
}

/**
 * Gets a series of historical closing prices using Birdeye.
 * @param mint The address of the token to analyze.
 * @param timeframe The timeframe of the candles.
 * @param limit The number of closing prices to retrieve.
 * @returns An array of numbers (closing prices) or an empty array if there's an error.
 */
export async function getHistoricalData(mint: string, timeframe: '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w', limit: number): Promise<number[]> {
    try {
        const tenDaysAgo = Math.floor((Date.now() - 10 * 24 * 60 * 60 * 1000) / 1000);
        const now = Math.floor(Date.now() / 1000);

        const url = `https://public-api.birdeye.so/defi/history_price?address=${mint}&address_type=token&type=${timeframe.toUpperCase()}&time_from=${tenDaysAgo}&time_to=${now}`;

        const headers = {'X-API-KEY': process.env.BIRDEYE_API_KEY};
        const response = await axios.get(url, { headers });

        if (response.data && response.data.data.items) {
            return response.data.data.items.map((item: any) => item.value).slice(-limit);
        }
        return [];
    } catch (error: any) {
        logger.error(`Error fetching historical data from Birdeye for ${mint}:`, error.message);
        return [];
    }
}