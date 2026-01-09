// src/config.ts

export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

export const marketFilterConfig = {
    // Using CoinGecko IDs for all assets (Birdeye free tier has rate limits)
    assets: [
        { name: 'BTC', id: 'bitcoin', weight: 0.25 },
        { name: 'ETH', id: 'ethereum', weight: 0.25 },
        { name: 'SOL', id: 'solana', weight: 0.50 }
    ],
    indicatorPeriod: 20,
    timeframe: '5m' as const,  // 5-minute candles for ultra-responsive meme coin trading
};

export const assetsToTrade = [
    {
        name: 'JUP',
        mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
        geckoPool: 'C8Gr6AUuq9hEdSYJzoEpNcdjpojPZwqG5MtQbeouNNwg'
    },
    {
        name: 'WIF',
        mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
        geckoPool: 'EP2ib6dYdEeqD8MfE2ezHCxX3kP3K2eLKkirfPm5eyMx'
    },
    {
        name: 'PENG',
        mint: '2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv',
        geckoPool: 'FAqh648xeeaTqL7du49sztp9nfj5PjRQrfvaMccyd9cz'
    },
    {
        name: 'BONK',
        mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
        geckoPool: '8QaXeHBrShJTdtN1rWCccBxpSVvKksQ2PCu5nufb2zbk'
    },
];

export const strategyConfig = {
    timeframe: '5m' as const,      // Maps to GeckoTerminal '/ohlcv/minute' = 1-minute candles (see jupiter.ts:49)
    historicalDataLimit: 100,
    tradeAmountUSDC: 500,          // v2.18.0: $500 per position, max 3 concurrent positions = $1,500 total capital
    takeProfitPercentage: 0.08,    // DEPRECATED: No longer used (trailing stop activates before TP can be reached)
    stopLossPercentage: 0.01,      // DEPRECATED: No longer used (trailing stop is sole exit mechanism since v2.17.2)
    // Strategy-specific parameters (DEPRECATED: Golden Cross and RSI no longer used as of v2.17.0)
    shortSMAPeriod: 12,            // DEPRECATED: SMA(12) - Golden Cross removed in v2.17.0
    longSMAPeriod: 26,             // DEPRECATED: SMA(26) - Golden Cross removed in v2.17.0
    rsiPeriod: 14,                 // DEPRECATED: RSI(14) - No longer used
    rsiThreshold: 50,              // DEPRECATED: RSI threshold - No longer used
    requireRsiConfirmation: false, // DEPRECATED: RSI confirmation - No longer used
};

export const BOT_EXECUTION_INTERVAL = 5 * 60 * 1000;         // 5 minutes - main analysis cycle (288 checks/day)
export const POSITION_CHECK_INTERVAL = 1 * 60 * 1000;        // 1 minute - position monitoring for trailing stop capture