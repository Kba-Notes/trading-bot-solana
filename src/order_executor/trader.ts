// src/order_executor/trader.ts

import { logger } from '../services.js';
import { sendTradeNotification, sendMessage } from '../notifier/telegram.js';
import { Connection, Keypair, VersionedTransaction, PublicKey, Transaction } from '@solana/web3.js';
import bs58 from 'bs58';
import axios from 'axios';
import { assetsToTrade, USDC_MINT } from '../config.js';
import { getCurrentPrice } from '../data_extractor/jupiter.js';

export interface OpenPosition {
    id: number;
    asset: string;
    entryPrice: number;
    amount: number;
    timestamp: Date;
}

let openPositions: OpenPosition[] = [];
let nextPositionId = 1;

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
 */
export async function executeBuyOrder(assetMint: string, amountUSDC: number, price: number): Promise<void> {
    const amountInSmallestUnit = Math.floor(amountUSDC * Math.pow(10, 6));
    const success = await performJupiterSwap(USDC_MINT, assetMint, amountInSmallestUnit, true);

    if (success) {
        const position: OpenPosition = {
            id: nextPositionId++,
            asset: assetMint,
            entryPrice: price,
            amount: amountUSDC,
            timestamp: new Date()
        };
        openPositions.push(position);

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
 */
export async function executeSellOrder(position: OpenPosition): Promise<void> {
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
            return;
        }

        const success = await performJupiterSwap(position.asset, USDC_MINT, amountToSell, false);

        if (success) {
            openPositions = openPositions.filter(p => p.id !== position.id);
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