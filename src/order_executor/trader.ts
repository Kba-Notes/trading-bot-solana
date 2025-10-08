// src/order_executor/trader.ts

import { logger } from '../services.js';
import { sendTradeNotification, sendMessage } from '../notifier/telegram.js';
import { Connection, Keypair, VersionedTransaction, PublicKey, Transaction } from '@solana/web3.js';
import bs58 from 'bs58';
import axios from 'axios';
import { assetsToTrade, USDC_MINT } from '../config.js';
import { getCurrentPrice } from '../data_extractor/jupiter.js';
import { validateSolanaAddress, validateTradeAmount, validatePrice, validatePositionLimit } from '../utils/validation.js';
import { SOLANA_CONSTANTS, TRADING_LIMITS } from '../constants.js';
import { savePositions, loadPositions } from '../persistence/positions.js';
import { retryWithBackoff } from '../utils/async.js';
import { PerformanceMetrics } from '../monitoring/metrics.js';
import { TradeExecutionError, getErrorMessage } from '../errors/custom-errors.js';

export interface OpenPosition {
    id: number;
    asset: string;
    entryPrice: number;
    amount: number;
    timestamp: Date;
    highestPrice?: number; // Track highest price for trailing stop
    trailingStopActive?: boolean; // Whether trailing stop is activated
}

let openPositions: OpenPosition[] = [];
let nextPositionId = 1;

/**
 * Initializes the trader by loading persisted positions from disk
 * Should be called once at bot startup
 */
export async function initializeTrader(): Promise<void> {
    try {
        openPositions = await loadPositions();

        // Set next position ID to avoid conflicts
        if (openPositions.length > 0) {
            nextPositionId = Math.max(...openPositions.map(p => p.id)) + 1;
        }

        logger.info('Trader initialized', {
            loadedPositions: openPositions.length,
            nextPositionId
        });
    } catch (error) {
        const err = error as Error;
        logger.error('Failed to initialize trader', { error: err.message });
        throw error;
    }
}

export function getOpenPositions(): OpenPosition[] {
    return openPositions;
}

async function performJupiterSwap(inputMint: string, outputMint: string, amount: number, isBuy: boolean) {
    logger.info(`Starting real SWAP. Input: ${inputMint}, Output: ${outputMint}, Amount (smallest unit): ${amount}`);

    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        logger.error('Private key not found in .env! Aborting operation.');
        sendTradeNotification({ asset: 'SYSTEM', action: 'SELL', price: 0, reason: 'Critical Error: Private key not found.'});
        return false;
    }
    const wallet = Keypair.fromSecretKey(bs58.decode(privateKey));
    const connection = new Connection('https://api.mainnet-beta.solana.com');

    try {
        logger.info('1. Getting Jupiter quote...');
        // FIXED: Endpoints updated to v1 (effective since Oct 1, 2025)
        const quoteResponse = await axios.get('https://lite-api.jup.ag/swap/v1/quote', {
            params: {
                inputMint,
                outputMint,
                amount,
                slippageBps: 250, // 2.5% slippage for less liquid tokens
                maxAccounts: 64, // Limits transaction complexity
                asLegacyTransaction: false, // Use versioned transactions by default
            }
        });

        if (!quoteResponse.data) {
            logger.error('Could not get a valid quote from Jupiter.');
            return false;
        }

        logger.info(`2. Quote obtained. Building swap transaction...`);
        const { data: swapResult } = await axios.post('https://lite-api.jup.ag/swap/v1/swap', {
            userPublicKey: wallet.publicKey.toBase58(),
            quoteResponse: quoteResponse.data,
            wrapAndUnwrapSol: true,
            dynamicComputeUnitLimit: true, // Optimizes compute units
            dynamicSlippage: true, // Adjusts slippage dynamically
            prioritizationFeeLamports: 'auto', // Automatic priority fees
        });

        if (!swapResult.swapTransaction) {
            logger.error('Did not receive a valid transaction from swap endpoint.');
            return false;
        }

        logger.info('3. Signing and sending transaction...');
        const swapTransactionBuf = Buffer.from(swapResult.swapTransaction, 'base64');
        let transaction;

        try {
            transaction = VersionedTransaction.deserialize(swapTransactionBuf);
            transaction.sign([wallet]);
        } catch (e) {
            transaction = Transaction.from(swapTransactionBuf);
            transaction.sign(wallet);
        }

        const rawTransaction = transaction.serialize();
        const txid = await connection.sendRawTransaction(rawTransaction, {
            skipPreflight: false,
            maxRetries: 3,
        });

        logger.info(`4. Transaction sent: ${txid}. Waiting for confirmation...`);
        await connection.confirmTransaction(txid, 'confirmed');

        logger.info(`✅ SWAP SUCCESSFUL! View on Solscan: https://solscan.io/tx/${txid}`);
        return true;

    } catch (error: any) {
        logger.error(`💥 ERROR executing swap for ${outputMint}.`);
        if (error.response) {
            logger.error(`[Jupiter API Error]:`);
            logger.error(`Status: ${error.response.status}`);
            logger.error(`Data: ${JSON.stringify(error.response.data, null, 2)}`);
        } else if (error.message) {
            logger.error(`[General Error]: ${error.message}`);
            if (error.logs) {
                logger.error(`[Transaction Logs]: ${JSON.stringify(error.logs, null, 2)}`);
            }
        }
        sendTradeNotification({
            asset: 'SYSTEM',
            action: 'SELL',
            price: 0,
            reason: `Swap error: ${error.response?.data || error.message}`
        });
        return false;
    }
}

/**
 * Executes a REAL buy order.
 *
 * @param assetMint The Solana mint address of the asset to buy
 * @param amountUSDC Amount in USDC to trade
 * @param price Current price for position tracking
 * @throws Error if validation fails or position limit exceeded
 */
export async function executeBuyOrder(assetMint: string, amountUSDC: number, price: number): Promise<void> {
    // Validate inputs
    validateSolanaAddress(assetMint, 'assetMint');
    validateSolanaAddress(USDC_MINT, 'USDC_MINT');
    validateTradeAmount(amountUSDC, 'amountUSDC');
    validatePrice(price, 'price');
    validatePositionLimit(openPositions.length);

    const amountInSmallestUnit = Math.floor(amountUSDC * Math.pow(10, SOLANA_CONSTANTS.USDC_DECIMALS));
    const swapStartTime = Date.now();
    const success = await performJupiterSwap(USDC_MINT, assetMint, amountInSmallestUnit, true);
    const swapDuration = Date.now() - swapStartTime;

    // Record metrics
    PerformanceMetrics.recordSwapTime(swapDuration);
    PerformanceMetrics.recordTrade('BUY', success);

    if (success) {
        const position: OpenPosition = {
            id: nextPositionId++,
            asset: assetMint,
            entryPrice: price,
            amount: amountUSDC,
            timestamp: new Date()
        };
        openPositions.push(position);

        // Persist positions to disk
        await savePositions(openPositions);

        const assetConfig = assetsToTrade.find(a => a.mint === assetMint);
        sendTradeNotification({
            asset: assetConfig?.name || assetMint,
            action: 'BUY',
            price: price,
            reason: 'Strategy signal confirmed.'
        });
    }
}

async function getTokenBalance(wallet: Keypair, connection: Connection, mint: PublicKey): Promise<number> {
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(wallet.publicKey, { mint });
    if (tokenAccounts.value.length > 0) {
        return parseInt(tokenAccounts.value[0].account.data.parsed.info.tokenAmount.amount);
    }
    return 0;
}

/**
 * Executes a REAL sell order.
 *
 * @param position The position to sell
 * @throws Error if private key not found
 */
export async function executeSellOrder(position: OpenPosition): Promise<void> {
    // Validate position data
    validateSolanaAddress(position.asset, 'position.asset');
    validatePrice(position.entryPrice, 'position.entryPrice');
    validateTradeAmount(position.amount, 'position.amount');

    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        logger.error('Cannot sell without private key.');
        return;
    }
    const wallet = Keypair.fromSecretKey(bs58.decode(privateKey));
    const connection = new Connection('https://api.mainnet-beta.solana.com');
    const assetConfig = assetsToTrade.find(a => a.mint === position.asset);
    const assetName = assetConfig?.name || position.asset;

    try {
        const amountToSell = await getTokenBalance(wallet, connection, new PublicKey(position.asset));
        if (amountToSell === 0) {
            logger.warn(`Attempted to sell ${assetName} but no balance found.`);
            openPositions = openPositions.filter(p => p.id !== position.id);
            await savePositions(openPositions);
            return;
        }

        const swapStartTime = Date.now();
        const success = await performJupiterSwap(position.asset, USDC_MINT, amountToSell, false);
        const swapDuration = Date.now() - swapStartTime;

        // Record metrics
        PerformanceMetrics.recordSwapTime(swapDuration);
        PerformanceMetrics.recordTrade('SELL', success);

        if (success) {
            openPositions = openPositions.filter(p => p.id !== position.id);
            await savePositions(openPositions);

            const currentPrice = await getCurrentPrice(position.asset) || position.entryPrice;
            const pnl = (currentPrice - position.entryPrice) * (position.amount / position.entryPrice);

            sendTradeNotification({
                asset: assetName,
                action: 'SELL',
                price: currentPrice,
                pnl: pnl
            });
        }
    } catch (error) {
        logger.error(`Critical error in sell process for ${assetName}:`, error);
    }
}