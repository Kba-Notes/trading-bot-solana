// src/order_executor/trader.ts

import { logger } from '../services.js';
import { sendTradeNotification, sendMessage, markOperationStart } from '../notifier/telegram.js';
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

        // Enhanced confirmation with timeout handling
        try {
            // Wait up to 60 seconds for confirmation (increased from default 30s)
            const latestBlockhash = await connection.getLatestBlockhash();
            const confirmation = await connection.confirmTransaction({
                signature: txid,
                blockhash: latestBlockhash.blockhash,
                lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
            }, 'confirmed');

            if (confirmation.value.err) {
                logger.error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
                return false;
            }

            logger.info(`✅ SWAP SUCCESSFUL! View on Solscan: https://solscan.io/tx/${txid}`);
            return true;
        } catch (confirmError: any) {
            // Transaction might have succeeded even if confirmation timed out
            logger.warn(`Confirmation timeout for ${txid}. Checking transaction status...`);

            // Check if transaction actually succeeded
            try {
                const status = await connection.getSignatureStatus(txid);
                if (status.value?.confirmationStatus === 'confirmed' || status.value?.confirmationStatus === 'finalized') {
                    logger.info(`✅ Transaction ${txid} confirmed successfully (verified after timeout)`);
                    return true;
                } else if (status.value?.err) {
                    logger.error(`Transaction ${txid} failed: ${JSON.stringify(status.value.err)}`);
                    return false;
                } else {
                    logger.error(`Transaction ${txid} status unknown - may need manual verification`);
                    return false;
                }
            } catch (statusError) {
                logger.error(`Failed to verify transaction status: ${statusError}`);
                return false;
            }
        }

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
 * Executes a REAL buy order with retry logic.
 *
 * @param assetMint The Solana mint address of the asset to buy
 * @param amountUSDC Amount in USDC to trade
 * @param price Current price for position tracking
 * @param retryCount Current retry attempt (used internally)
 * @throws Error if validation fails or position limit exceeded
 */
export async function executeBuyOrder(assetMint: string, amountUSDC: number, price: number, retryCount: number = 0): Promise<boolean> {
    const MAX_RETRIES = 3;
    // Exponential backoff: 5s, 10s, 20s (capped at 30s)
    const getRetryDelay = (attempt: number) => Math.min(5000 * Math.pow(2, attempt), 30000);

    // Validate inputs
    validateSolanaAddress(assetMint, 'assetMint');
    validateSolanaAddress(USDC_MINT, 'USDC_MINT');
    validateTradeAmount(amountUSDC, 'amountUSDC');
    validatePrice(price, 'price');
    validatePositionLimit(openPositions.length);

    const assetConfig = assetsToTrade.find(a => a.mint === assetMint);
    const assetName = assetConfig?.name || assetMint;

    // Check if position already exists for this asset
    const existingPosition = openPositions.find(p => p.asset === assetMint);
    if (existingPosition && retryCount === 0) {
        logger.warn(`Position already exists for ${assetName}, skipping buy order.`);
        return true; // Consider this a success - position already open
    }

    logger.info(`🔄 Buy attempt ${retryCount + 1}/${MAX_RETRIES + 1} for ${assetName} (${amountUSDC} USDC)`);

    const amountInSmallestUnit = Math.floor(amountUSDC * Math.pow(10, SOLANA_CONSTANTS.USDC_DECIMALS));
    const swapStartTime = Date.now();
    const success = await performJupiterSwap(USDC_MINT, assetMint, amountInSmallestUnit, true);
    const swapDuration = Date.now() - swapStartTime;

    // Record metrics
    PerformanceMetrics.recordSwapTime(swapDuration);
    PerformanceMetrics.recordTrade('BUY', success);

    if (success) {
        logger.info(`✅ Buy successful for ${assetName} after ${retryCount + 1} attempt(s)`);

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

        sendTradeNotification({
            asset: assetName,
            action: 'BUY',
            price: price,
            amount: amountUSDC,
            reason: 'Strategy signal confirmed.',
            indicators: {
                // Indicators will be added by the calling function if available
            }
        });

        return true;
    } else {
        // Swap failed - retry if attempts remaining
        if (retryCount < MAX_RETRIES) {
            const retryDelay = getRetryDelay(retryCount);
            logger.warn(`❌ Buy attempt ${retryCount + 1} failed for ${assetName}. Retrying in ${retryDelay / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            return await executeBuyOrder(assetMint, amountUSDC, price, retryCount + 1);
        } else {
            logger.error(`❌ All ${MAX_RETRIES + 1} buy attempts failed for ${assetName}.`);
            sendMessage(`⚠️ *CRITICAL: Failed to buy ${assetName}*\n\nAll ${MAX_RETRIES + 1} attempts failed. No position opened.\n\nAsset: ${assetName}\nIntended Entry: $${price.toFixed(6)}\nAmount: ${amountUSDC} USDC`);
            return false;
        }
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
 * Executes a REAL sell order with retry logic.
 *
 * @param position The position to sell
 * @param retryCount Current retry attempt (used internally)
 * @throws Error if private key not found
 */
export async function executeSellOrder(position: OpenPosition, retryCount: number = 0): Promise<boolean> {
    const MAX_RETRIES = 3;
    // Exponential backoff: 5s, 10s, 20s (capped at 30s)
    const getRetryDelay = (attempt: number) => Math.min(5000 * Math.pow(2, attempt), 30000);

    // Mark operation start for log extraction (only on first attempt)
    if (retryCount === 0) {
        markOperationStart();
    }

    // Check if position still exists (prevents duplicate sells from concurrent loops)
    const positionExists = openPositions.some(p => p.id === position.id);
    if (!positionExists) {
        const assetConfig = assetsToTrade.find(a => a.mint === position.asset);
        const assetName = assetConfig?.name || position.asset;
        logger.warn(`Position ${position.id} for ${assetName} no longer exists. Already sold by another process.`);
        return true; // Consider this a success - position is already closed
    }

    // Validate position data
    validateSolanaAddress(position.asset, 'position.asset');
    validatePrice(position.entryPrice, 'position.entryPrice');
    validateTradeAmount(position.amount, 'position.amount');

    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        logger.error('Cannot sell without private key.');
        return false;
    }
    const wallet = Keypair.fromSecretKey(bs58.decode(privateKey));
    const connection = new Connection('https://api.mainnet-beta.solana.com');
    const assetConfig = assetsToTrade.find(a => a.mint === position.asset);
    const assetName = assetConfig?.name || position.asset;

    try {
        const amountToSell = await getTokenBalance(wallet, connection, new PublicKey(position.asset));
        if (amountToSell === 0) {
            logger.warn(`Attempted to sell ${assetName} but no balance found. Position may have been sold already.`);
            openPositions = openPositions.filter(p => p.id !== position.id);
            await savePositions(openPositions);
            return true; // Consider this a success - position is closed
        }

        logger.info(`🔄 Sell attempt ${retryCount + 1}/${MAX_RETRIES + 1} for ${assetName} (${amountToSell} tokens)`);

        const swapStartTime = Date.now();
        const success = await performJupiterSwap(position.asset, USDC_MINT, amountToSell, false);
        const swapDuration = Date.now() - swapStartTime;

        // Record metrics
        PerformanceMetrics.recordSwapTime(swapDuration);
        PerformanceMetrics.recordTrade('SELL', success);

        if (success) {
            // Successfully sold - remove position
            logger.info(`✅ Sell successful for ${assetName} after ${retryCount + 1} attempt(s)`);
            openPositions = openPositions.filter(p => p.id !== position.id);
            await savePositions(openPositions);

            const currentPrice = await getCurrentPrice(position.asset) || position.entryPrice;
            const pnl = (currentPrice - position.entryPrice) * (position.amount / position.entryPrice);
            const pnlPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;

            await sendTradeNotification({
                asset: assetName,
                action: 'SELL',
                price: currentPrice,
                entryPrice: position.entryPrice,
                pnl: pnl,
                percentage: pnlPercent
            });

            logger.info(`💰 ${assetName} sold: Entry=$${position.entryPrice.toFixed(6)}, Exit=$${currentPrice.toFixed(6)}, P&L=${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}% (${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)})`);

            return true;
        } else {
            // Swap failed - retry if attempts remaining
            if (retryCount < MAX_RETRIES) {
                const retryDelay = getRetryDelay(retryCount);
                logger.warn(`❌ Sell attempt ${retryCount + 1} failed for ${assetName}. Retrying in ${retryDelay / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                return await executeSellOrder(position, retryCount + 1);
            } else {
                logger.error(`❌ All ${MAX_RETRIES + 1} sell attempts failed for ${assetName}. Position remains open.`);
                sendMessage(`⚠️ *CRITICAL: Failed to sell ${assetName}*\n\nAll ${MAX_RETRIES + 1} attempts failed. Position remains open. Manual intervention may be required.\n\nPosition: ${assetName}\nEntry: $${position.entryPrice.toFixed(6)}`);
                return false;
            }
        }
    } catch (error) {
        logger.error(`Critical error in sell process for ${assetName}:`, error);

        // Retry on critical errors too
        if (retryCount < MAX_RETRIES) {
            const retryDelay = getRetryDelay(retryCount);
            logger.warn(`Retrying after critical error (${retryCount + 1}/${MAX_RETRIES}) in ${retryDelay / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            return await executeSellOrder(position, retryCount + 1);
        }

        return false;
    }
}