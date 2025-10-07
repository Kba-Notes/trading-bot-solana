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
        logger.info('1. Obteniendo cotización de Jupiter...');
        // CORRECCIÓN: Endpoints actualizados a v1 (vigentes desde Oct 1, 2025)
        const quoteResponse = await axios.get('https://lite-api.jup.ag/swap/v1/quote', {
            params: {
                inputMint,
                outputMint,
                amount,
                slippageBps: 250, // 2.5% slippage para tokens menos líquidos
                maxAccounts: 64, // Limita complejidad de la transacción
                asLegacyTransaction: false, // Usar transacciones versionadas por defecto
            }
        });

        if (!quoteResponse.data) {
            logger.error('No se pudo obtener una cotización válida de Jupiter.');
            return false;
        }

        logger.info(`2. Cotización obtenida. Construyendo transacción de swap...`);
        const { data: swapResult } = await axios.post('https://lite-api.jup.ag/swap/v1/swap', {
            userPublicKey: wallet.publicKey.toBase58(),
            quoteResponse: quoteResponse.data,
            wrapAndUnwrapSol: true,
            dynamicComputeUnitLimit: true, // Optimiza compute units
            dynamicSlippage: true, // Ajusta slippage dinámicamente
            prioritizationFeeLamports: 'auto', // Priority fees automáticos
        });

        if (!swapResult.swapTransaction) {
            logger.error('No se recibió una transacción válida del endpoint de swap.');
            return false;
        }

        logger.info('3. Firmando y enviando transacción...');
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

        logger.info(`4. Transacción enviada: ${txid}. Esperando confirmación...`);
        await connection.confirmTransaction(txid, 'confirmed');

        logger.info(`✅ ¡SWAP EXITOSO! Ver en Solscan: https://solscan.io/tx/${txid}`);
        return true;

    } catch (error: any) {
        logger.error(`💥 ERROR al ejecutar el swap para ${outputMint}.`);
        if (error.response) {
            logger.error(`[Error de Jupiter API]:`);
            logger.error(`Status: ${error.response.status}`);
            logger.error(`Data: ${JSON.stringify(error.response.data, null, 2)}`);
        } else if (error.message) {
            logger.error(`[Error General]: ${error.message}`);
            if (error.logs) {
                logger.error(`[Transaction Logs]: ${JSON.stringify(error.logs, null, 2)}`);
            }
        }
        sendTradeNotification({
            asset: 'SISTEMA',
            action: 'VENTA',
            price: 0,
            reason: `Error en swap: ${error.response?.data || error.message}`
        });
        return false;
    }
}

// ... (El resto de las funciones: executeBuyOrder, getTokenBalance, executeSellOrder no necesitan cambios)
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
            const currentPrice = await getCurrentPrice(position.asset) || position.entryPrice;
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