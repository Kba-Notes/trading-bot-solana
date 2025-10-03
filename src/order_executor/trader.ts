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
    asset: string; // La dirección MINT del token
    entryPrice: number;
    amount: number; // Cantidad en USDC
    timestamp: Date;
}

// --- GESTIÓN DE ESTADO ---
let openPositions: OpenPosition[] = [];
let nextPositionId = 1;

export function getOpenPositions(): OpenPosition[] {
    return openPositions;
}

// --- LÓGICA DE EJECUCIÓN REAL ---

async function performJupiterSwap(inputMint: string, outputMint: string, amount: number, isBuy: boolean) {
    logger.info(`Iniciando SWAP real. Entrada: ${inputMint}, Salida: ${outputMint}, Monto (unidad mínima): ${amount}`);
    
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        logger.error('¡Clave privada no encontrada en .env! Abortando operación.');
        sendTradeNotification({ asset: 'SISTEMA', action: 'VENTA', price: 0, reason: 'Error Crítico: Clave privada no encontrada.'});
        return false;
    }
    const wallet = Keypair.fromSecretKey(bs58.decode(privateKey));
    const connection = new Connection('https://api.mainnet-beta.solana.com');

    try {
        const quoteResponse = await axios.get('https://quote-api.jup.ag/v6/quote', {
            params: { 
                inputMint, 
                outputMint, 
                amount, 
                userPublicKey: wallet.publicKey.toBase58(), 
                slippageBps: 150,
                onlyDirectRoutes: true,
            }
        });

        const { data: swapResult } = await axios.post('https://quote-api.jup.ag/v6/swap', {
            userPublicKey: wallet.publicKey.toBase58(),
            quoteResponse: quoteResponse.data,
            wrapAndUnwrapSol: true,
            asLegacyTransaction: true,
        });

        const swapTransactionBuf = Buffer.from(swapResult.swapTransaction, 'base64');
        let transaction;
        let isVersioned = true;
        try {
            transaction = VersionedTransaction.deserialize(swapTransactionBuf);
        } catch (e) {
            transaction = Transaction.from(swapTransactionBuf);
            isVersioned = false;
        }
        
        // --- CORRECCIÓN APLICADA ---
        if (isVersioned) {
            (transaction as VersionedTransaction).sign([wallet]);
        } else {
            (transaction as Transaction).sign(wallet);
        }

        const txid = await connection.sendRawTransaction(transaction.serialize());
        await connection.confirmTransaction(txid);
        
        logger.info(`✅ ¡SWAP EXITOSO! Ver en Solscan: https://solscan.io/tx/${txid}`);
        return true;

    } catch (error: any) {
        const assetName = isBuy ? outputMint : inputMint;
        logger.error(`💥 ERROR al ejecutar el swap para ${assetName}.`, error.response?.data || error.message);
        sendTradeNotification({ asset: 'SISTEMA', action: 'VENTA', price: 0, reason: `Error en Swap para ${assetName}. Revisa los logs.`});
        return false;
    }
}


/**
 * Ejecuta una orden de compra REAL.
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
            action: 'COMPRA',
            price: price,
            reason: 'Señal de estrategia confirmada.'
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
 * Ejecuta una orden de venta REAL.
 */
export async function executeSellOrder(position: OpenPosition): Promise<void> {
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        logger.error('No se puede vender sin clave privada.');
        return;
    }
    const wallet = Keypair.fromSecretKey(bs58.decode(privateKey));
    const connection = new Connection('https://api.mainnet-beta.solana.com');
    const assetConfig = assetsToTrade.find(a => a.mint === position.asset);
    const assetName = assetConfig?.name || position.asset;

    try {
        const amountToSell = await getTokenBalance(wallet, connection, new PublicKey(position.asset));
        if (amountToSell === 0) {
            logger.warn(`Intento de venta de ${assetName} pero no se encontró balance.`);
            openPositions = openPositions.filter(p => p.id !== position.id);
            return;
        }
        
        const success = await performJupiterSwap(position.asset, USDC_MINT, amountToSell, false);

        if (success) {
            openPositions = openPositions.filter(p => p.id !== position.id);
            const currentPrice = await getCurrentPrice(position.asset, USDC_MINT) || position.entryPrice;
            const pnl = (currentPrice - position.entryPrice) * (position.amount / position.entryPrice);

            sendTradeNotification({
                asset: assetName,
                action: 'VENTA',
                price: currentPrice,
                pnl: pnl
            });
        }
    } catch (error) {
        logger.error(`Error crítico en el proceso de venta de ${assetName}:`, error);
    }
}