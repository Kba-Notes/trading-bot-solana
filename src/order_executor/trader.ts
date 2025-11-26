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
import { getLatestMarketHealth, getDynamicTrailingStop } from '../bot.js';

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

async function performJupiterSwap(inputMint: string, outputMint: string, amount: number, isBuy: boolean, rpcUrl?: string) {
    const actualRpcUrl = rpcUrl || 'https://api.mainnet-beta.solana.com';
    logger.info(`Starting real SWAP. Input: ${inputMint}, Output: ${outputMint}, Amount (smallest unit): ${amount}${rpcUrl ? ' (using fallback RPC)' : ''}`);

    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        logger.error('Private key not found in .env! Aborting operation.');
        sendTradeNotification({ asset: 'SYSTEM', action: 'SELL', price: 0, reason: 'Critical Error: Private key not found.'});
        return false;
    }
    const wallet = Keypair.fromSecretKey(bs58.decode(privateKey));
    const connection = new Connection(actualRpcUrl);

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
            skipPreflight: true,  // Skip simulation to prevent blockhash expiration (Jupiter validates server-side)
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
        // Don't send notification here - retry logic will send CRITICAL alert if all attempts fail
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

        // Get current market health to set initial trailing stop
        const currentMarketHealth = getLatestMarketHealth();
        const trailingStopPercent = getDynamicTrailingStop(currentMarketHealth);

        const position: OpenPosition = {
            id: nextPositionId++,
            asset: assetMint,
            entryPrice: price,
            amount: amountUSDC,
            timestamp: new Date(),
            trailingStopActive: true,  // Activate trailing stop immediately on entry
            highestPrice: price         // Set highest price to entry price
        };
        openPositions.push(position);

        logger.info(`🔒 Trailing stop activated immediately for ${assetName} at entry ($${price.toFixed(8)}) with ${(trailingStopPercent * 100).toFixed(1)}% trail (MH=${currentMarketHealth.toFixed(2)})`);

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
            // All retries exhausted - try Helius fallback with retries
            const heliusRpcUrl = process.env.HELIUS_RPC_URL;
            if (heliusRpcUrl) {
                logger.warn(`🔄 All ${MAX_RETRIES + 1} attempts failed. Trying Helius fallback RPC (up to 3 attempts)...`);
                let heliusSuccess = false;

                // Try Helius fallback up to 3 times
                for (let i = 0; i < 3; i++) {
                    logger.info(`🔄 Helius attempt ${i + 1}/3 for ${assetName}`);
                    heliusSuccess = await performJupiterSwap(USDC_MINT, assetMint, amountInSmallestUnit, true, heliusRpcUrl);

                    if (heliusSuccess) {
                        break; // Success, exit retry loop
                    }

                    if (i < 2) { // Don't delay after last attempt
                        const delay = 3000 * (i + 1); // 3s, 6s
                        logger.warn(`❌ Helius attempt ${i + 1} failed. Retrying in ${delay / 1000}s...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                }

                if (heliusSuccess) {
                    logger.info(`✅ Helius fallback successful for ${assetName}!`);

                    // Get current market health to set initial trailing stop
                    const currentMarketHealth = getLatestMarketHealth();
                    const trailingStopPercent = getDynamicTrailingStop(currentMarketHealth);

                    const position: OpenPosition = {
                        id: nextPositionId++,
                        asset: assetMint,
                        entryPrice: price,
                        amount: amountUSDC,
                        timestamp: new Date(),
                        trailingStopActive: true,
                        highestPrice: price
                    };
                    openPositions.push(position);

                    logger.info(`🔒 Trailing stop activated immediately for ${assetName} at entry ($${price.toFixed(8)}) with ${(trailingStopPercent * 100).toFixed(1)}% trail (MH=${currentMarketHealth.toFixed(2)})`);

                    await savePositions(openPositions);

                    sendTradeNotification({
                        asset: assetName,
                        action: 'BUY',
                        price: price,
                        amount: amountUSDC,
                        reason: 'Strategy signal confirmed (via Helius fallback).',
                        indicators: {}
                    });

                    return true;
                }
            }

            logger.error(`❌ All attempts failed for ${assetName} (including Helius fallback).`);
            sendMessage(`⚠️ *CRITICAL: Failed to buy ${assetName}*\n\nAll ${MAX_RETRIES + 1} attempts + Helius fallback failed. No position opened.\n\nAsset: ${assetName}\nIntended Entry: $${price.toFixed(6)}\nAmount: ${amountUSDC} USDC`);
            return false;
        }
    }
}

async function getTokenBalance(wallet: Keypair, connection: Connection, mint: PublicKey): Promise<number> {
    const MAX_RETRIES = 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const tokenAccounts = await connection.getParsedTokenAccountsByOwner(wallet.publicKey, { mint });
            if (tokenAccounts.value.length > 0) {
                return parseInt(tokenAccounts.value[0].account.data.parsed.info.tokenAmount.amount);
            }
            return 0;
        } catch (error: any) {
            lastError = error;
            const is429 = error.message && error.message.includes('429');
            const isRateLimit = error.message && (error.message.includes('Too Many Requests') || error.message.includes('rate limit'));

            if ((is429 || isRateLimit) && attempt < MAX_RETRIES) {
                const delay = Math.min(2000 * Math.pow(2, attempt), 8000); // 2s, 4s, 8s
                logger.warn(`⚠️ Rate limit hit when checking balance (attempt ${attempt + 1}/${MAX_RETRIES + 1}). Retrying in ${delay / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else if (attempt < MAX_RETRIES) {
                const delay = 1000 * (attempt + 1); // 1s, 2s, 3s for other errors
                logger.warn(`⚠️ Error checking balance (attempt ${attempt + 1}/${MAX_RETRIES + 1}): ${error.message}. Retrying in ${delay / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    // All retries exhausted
    throw new Error(`Failed to get token balance after ${MAX_RETRIES + 1} attempts: ${lastError?.message || 'Unknown error'}`);
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

        // Get USDC balance before swap to calculate actual P&L
        const usdcMint = new PublicKey(USDC_MINT);
        const usdcBalanceBefore = await getTokenBalance(wallet, connection, usdcMint);
        logger.info(`USDC balance before sell: ${(usdcBalanceBefore / Math.pow(10, SOLANA_CONSTANTS.USDC_DECIMALS)).toFixed(2)} USDC`);

        const swapStartTime = Date.now();
        const success = await performJupiterSwap(position.asset, USDC_MINT, amountToSell, false);
        const swapDuration = Date.now() - swapStartTime;

        // Record metrics
        PerformanceMetrics.recordSwapTime(swapDuration);
        PerformanceMetrics.recordTrade('SELL', success);

        if (success) {
            // Successfully sold - remove position
            logger.info(`✅ Sell successful for ${assetName} after ${retryCount + 1} attempt(s)`);

            // Try to get actual P&L, but don't fail if balance check fails (swap already succeeded)
            let actualPnL: number;
            let actualPnLPercent: number;
            let currentPrice: number;

            try {
                // Get USDC balance after swap to calculate actual P&L
                const usdcBalanceAfter = await getTokenBalance(wallet, connection, usdcMint);
                const usdcReceived = (usdcBalanceAfter - usdcBalanceBefore) / Math.pow(10, SOLANA_CONSTANTS.USDC_DECIMALS);
                logger.info(`USDC balance after sell: ${(usdcBalanceAfter / Math.pow(10, SOLANA_CONSTANTS.USDC_DECIMALS)).toFixed(2)} USDC`);
                logger.info(`USDC received from sell: ${usdcReceived.toFixed(2)} USDC`);

                // Calculate ACTUAL P&L based on real USDC received vs amount spent
                actualPnL = usdcReceived - position.amount;
                actualPnLPercent = (actualPnL / position.amount) * 100;

                currentPrice = await getCurrentPrice(position.asset) || position.entryPrice;
            } catch (balanceError) {
                // Balance check failed (e.g., 429 rate limit) - use estimated P&L
                logger.warn(`⚠️ Could not check USDC balance after sell (${getErrorMessage(balanceError)}). Using estimated P&L.`);
                currentPrice = await getCurrentPrice(position.asset) || position.entryPrice;
                actualPnL = (currentPrice - position.entryPrice) * (position.amount / position.entryPrice);
                actualPnLPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
                logger.info(`Estimated P&L: ${actualPnLPercent >= 0 ? '+' : ''}${actualPnLPercent.toFixed(2)}% (${actualPnL >= 0 ? '+' : ''}$${actualPnL.toFixed(2)})`);
            }

            // Remove position (swap already succeeded)
            openPositions = openPositions.filter(p => p.id !== position.id);
            await savePositions(openPositions);

            const pnl = actualPnL;
            const pnlPercent = actualPnLPercent;

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
                // All retries exhausted - try Helius fallback with retries
                const heliusRpcUrl = process.env.HELIUS_RPC_URL;
                if (heliusRpcUrl) {
                    logger.warn(`🔄 All ${MAX_RETRIES + 1} attempts failed. Trying Helius fallback RPC (up to 3 attempts)...`);
                    let heliusSuccess = false;

                    // Get USDC balance before Helius swap to calculate actual P&L
                    const heliusConnection = new Connection(heliusRpcUrl);
                    const usdcMintHelius = new PublicKey(USDC_MINT);
                    const usdcBalanceBeforeHelius = await getTokenBalance(wallet, heliusConnection, usdcMintHelius);
                    logger.info(`USDC balance before Helius sell: ${(usdcBalanceBeforeHelius / Math.pow(10, SOLANA_CONSTANTS.USDC_DECIMALS)).toFixed(2)} USDC`);

                    // Try Helius fallback up to 3 times
                    for (let i = 0; i < 3; i++) {
                        logger.info(`🔄 Helius attempt ${i + 1}/3 for ${assetName}`);
                        heliusSuccess = await performJupiterSwap(position.asset, USDC_MINT, amountToSell, false, heliusRpcUrl);

                        if (heliusSuccess) {
                            break; // Success, exit retry loop
                        }

                        if (i < 2) { // Don't delay after last attempt
                            const delay = 3000 * (i + 1); // 3s, 6s
                            logger.warn(`❌ Helius attempt ${i + 1} failed. Retrying in ${delay / 1000}s...`);
                            await new Promise(resolve => setTimeout(resolve, delay));
                        }
                    }

                    if (heliusSuccess) {
                        logger.info(`✅ Helius fallback successful for ${assetName}!`);

                        // Try to get actual P&L, but don't fail if balance check fails (swap already succeeded)
                        let actualPnLHelius: number;
                        let actualPnLPercentHelius: number;
                        let currentPrice: number;

                        try {
                            // Get USDC balance after Helius swap to calculate actual P&L
                            const usdcBalanceAfterHelius = await getTokenBalance(wallet, heliusConnection, usdcMintHelius);
                            const usdcReceivedHelius = (usdcBalanceAfterHelius - usdcBalanceBeforeHelius) / Math.pow(10, SOLANA_CONSTANTS.USDC_DECIMALS);
                            logger.info(`USDC balance after Helius sell: ${(usdcBalanceAfterHelius / Math.pow(10, SOLANA_CONSTANTS.USDC_DECIMALS)).toFixed(2)} USDC`);
                            logger.info(`USDC received from Helius sell: ${usdcReceivedHelius.toFixed(2)} USDC`);

                            // Calculate ACTUAL P&L based on real USDC received vs amount spent
                            actualPnLHelius = usdcReceivedHelius - position.amount;
                            actualPnLPercentHelius = (actualPnLHelius / position.amount) * 100;

                            currentPrice = await getCurrentPrice(position.asset) || position.entryPrice;
                        } catch (balanceError) {
                            // Balance check failed - use estimated P&L
                            logger.warn(`⚠️ Could not check USDC balance after Helius sell (${getErrorMessage(balanceError)}). Using estimated P&L.`);
                            currentPrice = await getCurrentPrice(position.asset) || position.entryPrice;
                            actualPnLHelius = (currentPrice - position.entryPrice) * (position.amount / position.entryPrice);
                            actualPnLPercentHelius = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
                            logger.info(`Estimated P&L: ${actualPnLPercentHelius >= 0 ? '+' : ''}${actualPnLPercentHelius.toFixed(2)}% (${actualPnLHelius >= 0 ? '+' : ''}$${actualPnLHelius.toFixed(2)})`);
                        }

                        // Remove position (swap already succeeded)
                        openPositions = openPositions.filter(p => p.id !== position.id);
                        await savePositions(openPositions);

                        const pnl = actualPnLHelius;
                        const pnlPercent = actualPnLPercentHelius;

                        await sendTradeNotification({
                            asset: assetName,
                            action: 'SELL',
                            price: currentPrice,
                            entryPrice: position.entryPrice,
                            pnl: pnl,
                            percentage: pnlPercent
                        });

                        logger.info(`💰 ${assetName} sold via Helius: Entry=$${position.entryPrice.toFixed(6)}, Exit=$${currentPrice.toFixed(6)}, P&L=${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}% (${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)})`);
                        return true;
                    }
                }

                logger.error(`❌ All attempts failed for ${assetName} (including Helius fallback). Position remains open.`);
                sendMessage(`⚠️ *CRITICAL: Failed to sell ${assetName}*\n\nAll ${MAX_RETRIES + 1} attempts + Helius fallback failed. Position remains open. Manual intervention may be required.\n\nPosition: ${assetName}\nEntry: $${position.entryPrice.toFixed(6)}`);
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