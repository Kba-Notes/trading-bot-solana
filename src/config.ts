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
    timeframe: '5m' as const,      // 5-minute candles for ultra-responsive meme coin signals
    historicalDataLimit: 100,
    tradeAmountUSDC: 500,
    takeProfitPercentage: 0.08,    // DEPRECATED: No longer used (trailing stop activates before TP can be reached)
    stopLossPercentage: 0.01,      // 1% stop loss (consistent with dynamic trailing stop)
    // Strategy-specific parameters
    shortSMAPeriod: 12,            // SMA(12) on 5-min = 1 hour of data
    longSMAPeriod: 26,             // SMA(26) on 5-min = 2.2 hours of data
    rsiPeriod: 14,
    rsiThreshold: 50,
    // RSI filter control - set to false for meme coins (momentum-driven assets)
    // Meme coins often start rallies from oversold conditions (RSI < 50)
    // Enabling this filter can cause missed Golden Cross entries (e.g., BONK at RSI 34.88)
    requireRsiConfirmation: false,  // Set to true for more conservative entries
};

export const BOT_EXECUTION_INTERVAL = 5 * 60 * 1000;         // 5 minutes - main analysis cycle (288 checks/day)
export const POSITION_CHECK_INTERVAL = 1 * 60 * 1000;        // 1 minute - position monitoring for trailing stop capture