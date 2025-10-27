/**
 * @module constants
 * 
 * Central location for all magic numbers and configuration constants.
 * This makes the codebase more maintainable and self-documenting.
 */

// API Rate Limiting
export const API_DELAYS = {
    /** Delay between Jupiter API calls (1 RPS = 1000ms, using 1100ms for safety) */
    RATE_LIMIT: 1100,

    /** Delay between market data API calls (CoinGecko free tier) */
    MARKET_DATA_API: 2000,

    /** Delay between Birdeye API calls to avoid rate limits (free tier) */
    BIRDEYE_API: 1500,
} as const;

// Bot Behavior
export const BOT_CONSTANTS = {
    /** Number of execution cycles before sending a heartbeat message (24 cycles = 24 hours with 1h interval) */
    HEARTBEAT_CYCLE_COUNT: 24,
    
    /** Minimum number of historical data points required for strategy analysis */
    MIN_HISTORICAL_DATA_POINTS: 50,
    
    /** Number of days of historical data to fetch for market health */
    MARKET_HEALTH_HISTORY_DAYS: 30,
    
    /** Number of days of historical data to fetch for asset analysis */
    ASSET_HISTORY_DAYS: 10,
} as const;

// Trading Limits
export const TRADING_LIMITS = {
    /** Maximum trade amount in USDC to prevent accidental large orders */
    MAX_TRADE_AMOUNT_USDC: 10000,
    
    /** Minimum trade amount in USDC (Jupiter swap minimum) */
    MIN_TRADE_AMOUNT_USDC: 0.1,
    
    /** Maximum number of concurrent open positions */
    MAX_OPEN_POSITIONS: 10,
} as const;

// Solana Constants
export const SOLANA_CONSTANTS = {
    /** USDC token decimals on Solana */
    USDC_DECIMALS: 6,
    
    /** Minimum Solana address length */
    MIN_ADDRESS_LENGTH: 32,
} as const;

// Retry Configuration
export const RETRY_CONFIG = {
    /** Maximum number of retry attempts for API calls */
    MAX_RETRIES: 3,
    
    /** Base delay for exponential backoff (ms) */
    BASE_DELAY: 1000,
    
    /** Maximum delay cap for exponential backoff (ms) */
    MAX_DELAY: 10000,
} as const;
