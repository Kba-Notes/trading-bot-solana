// src/config.ts

export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

export const marketFilterConfig = {
    // Usaremos los IDs de CoinGecko para BTC y ETH
    assets: [
        { name: 'BTC', id: 'bitcoin', weight: 0.25 },
        { name: 'ETH', id: 'ethereum', weight: 0.25 },
        // Para SOL usamos su mint address porque lo obtendremos de Birdeye
        { name: 'SOL', id: 'So11111111111111111111111111111111111111112', weight: 0.50 }
    ],
    indicatorPeriod: 20,
    timeframe: '1d' as const,
};

export const assetsToTrade = [
    { name: 'JUP', mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN' },
    { name: 'JTO', mint: 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL' },
    { name: 'WIF', mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm' },
    { name: 'PENG', mint: '2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv' },
    { name: 'BONK', mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263' },
];

export const strategyConfig = {
    timeframe: '4h' as const,
    historicalDataLimit: 100,
    tradeAmountUSDC: 500,
    takeProfitPercentage: 0.08,    // Increased from 4% to 8% for better meme coin upside capture
    stopLossPercentage: 0.03,      // Increased from 2% to 3% to reduce false stops
    // Strategy-specific parameters
    shortSMAPeriod: 12,
    longSMAPeriod: 26,
    rsiPeriod: 14,
    rsiThreshold: 50,
};

export const BOT_EXECUTION_INTERVAL = 4 * 60 * 60 * 1000;        // 4 hours - main analysis cycle
export const POSITION_CHECK_INTERVAL = 15 * 60 * 1000;            // 15 minutes - position monitoring