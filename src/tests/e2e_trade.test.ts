// src/tests/e2e_trade.test.ts
import 'dotenv/config';
import { Connection, Keypair, VersionedTransaction, PublicKey, Transaction } from '@solana/web3.js';
import bs58 from 'bs58';
import axios from 'axios';
import { logger } from '../services.js';

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const BONK_MINT = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
const USDC_DECIMALS = 6;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function getTokenBalance(wallet: Keypair, connection: Connection, mintAddress: string): Promise<number> {
    const mintPublicKey = new PublicKey(mintAddress);
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(wallet.publicKey, { mint: mintPublicKey });
    
    if (tokenAccounts.value.length > 0) {
        const balance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.amount;
        return parseInt(balance);
    }
    return 0;
}

async function performRealSwap(inputMint: string, outputMint: string, amount: number): Promise<string | null> {
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        logger.error('¡Clave privada no encontrada en .env!');
        return null;
    }
    const wallet = Keypair.fromSecretKey(bs58.decode(privateKey));
    const connection = new Connection('https://api.mainnet-beta.solana.com');

    try {
        logger.info(`1. Obteniendo cotización para ${amount} lamports de ${inputMint} -> ${outputMint}`);
        const quoteResponse = await axios.get('https://quote-api.jup.ag/v6/quote', {
            params: { 
                inputMint, 
                outputMint, 
                amount, 
                userPublicKey: wallet.publicKey.toBase58(), 
                slippageBps: 150, // Aumentamos un poco el slippage a 1.5%
                onlyDirectRoutes: true, // Forzamos rutas directas
            }
        });

        logger.info('2. Obteniendo la transacción del swap...');
        const { data: swapResult } = await axios.post('https://quote-api.jup.ag/v6/swap', {
            userPublicKey: wallet.publicKey.toBase58(),
            quoteResponse: quoteResponse.data,
            wrapAndUnwrapSol: true,
            asLegacyTransaction: true, // Forzamos una transacción legacy para mayor compatibilidad
        });

        logger.info('3. Firmando y enviando la transacción...');
        const swapTransactionBuf = Buffer.from(swapResult.swapTransaction, 'base64');
        let transaction;
        let isVersioned = true;
        try {
            transaction = VersionedTransaction.deserialize(swapTransactionBuf);
        } catch (e) {
            transaction = Transaction.from(swapTransactionBuf);
            isVersioned = false;
        }
        
        // --- CORRECCIÓN ---
        // Firmamos de la manera correcta según el tipo de transacción
        if (isVersioned) {
            (transaction as VersionedTransaction).sign([wallet]);
        } else {
            (transaction as Transaction).sign(wallet);
        }

        const txid = await connection.sendRawTransaction(transaction.serialize());
        
        logger.info(`4. Esperando confirmación de la transacción...`);
        await connection.confirmTransaction(txid);
        
        logger.info(`✅ ¡SWAP EXITOSO! Ver en Solscan: https://solscan.io/tx/${txid}`);
        return quoteResponse.data.outAmount;

    } catch (error: any) {
        // --- LOG DE ERROR MEJORADO ---
        logger.error("💥 ERROR al ejecutar el swap.");
        if (error.response) {
            logger.error(`Status: ${error.response.status}`);
            logger.error(`Data: ${JSON.stringify(error.response.data)}`);
        } else {
            logger.error(error.message);
        }
        return null;
    }
}

async function runE2ETest() {
    logger.info('--- 🚀 Iniciando Prueba End-to-End con 1 USDC ---');

    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        logger.error('¡Clave privada no encontrada en .env!');
        return;
    }
    const wallet = Keypair.fromSecretKey(bs58.decode(privateKey));
    const connection = new Connection('https://api.mainnet-beta.solana.com');

    // --- FASE DE COMPRA ---
    logger.info('\n--- FASE 1: Comprando BONK con 1 USDC ---');
    const amountToBuy = 1 * Math.pow(10, USDC_DECIMALS); // 1 USDC
    const buyResult = await performRealSwap(USDC_MINT, BONK_MINT, amountToBuy);

    if (buyResult === null) {
        logger.error('La prueba de compra falló. No se continuará con la venta.');
        return;
    }
    
    logger.info(`Compra aparentemente finalizada. Esperando 15 segundos para que la blockchain se actualice...`);
    await sleep(15000);

    // --- FASE DE VENTA ---
    logger.info('\n--- FASE 2: Vendiendo TODO el BONK comprado de vuelta a USDC ---');
    
    const amountToSell = await getTokenBalance(wallet, connection, BONK_MINT);
    logger.info(`Balance real de BONK encontrado en la wallet: ${amountToSell} lamports.`);

    if (amountToSell > 0) {
        const usdcReceivedAmount = await performRealSwap(BONK_MINT, USDC_MINT, amountToSell);
        if(usdcReceivedAmount === null) {
            logger.error('La prueba de venta falló.');
            return;
        }
        logger.info(`Venta finalizada. Cantidad de USDC recuperado (en lamports): ${usdcReceivedAmount}`);
    } else {
        logger.error('No se encontró balance de BONK para vender.');
    }
    
    logger.info(`--- ✅ Prueba End-to-End Finalizada ---`);
}

runE2ETest();