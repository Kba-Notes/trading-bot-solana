// src/tests/manual_buy.test.ts
import 'dotenv/config';
import { Connection, Keypair, VersionedTransaction, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import axios from 'axios';
import { logger } from '../services.js';

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const PENG_MINT = '2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_DECIMALS = 6;

async function performRealSwap(inputMint: string, outputMint: string, amount: number) {
    logger.info(`Iniciando SWAP real. Entrada: ${inputMint}, Salida: ${outputMint}, Monto (unidad mínima): ${amount}`);
    
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        logger.error('¡Clave privada no encontrada en .env!');
        return false;
    }
    const wallet = Keypair.fromSecretKey(bs58.decode(privateKey));
    const connection = new Connection('https://api.mainnet-beta.solana.com');

    try {
        logger.info(`1. Obteniendo cotización desde lite-api v1...`);
        const quoteResponse = await axios.get('https://lite-api.jup.ag/swap/v1/quote', {
            params: {
                inputMint,
                outputMint,
                amount,
                slippageBps: 500, // 5% para máxima probabilidad con tokens menos líquidos
                maxAccounts: 64,
            }
        });

        if (!quoteResponse.data) {
            logger.error('No se recibió cotización válida.');
            return false;
        }

        logger.info('2. Obteniendo la transacción del swap desde lite-api v1...');
        const { data: swapResult } = await axios.post('https://lite-api.jup.ag/swap/v1/swap', {
            userPublicKey: wallet.publicKey.toBase58(),
            quoteResponse: quoteResponse.data,
            wrapAndUnwrapSol: true,
            dynamicComputeUnitLimit: true,
            dynamicSlippage: true,
            prioritizationFeeLamports: 'auto'
        });

        if (!swapResult.swapTransaction) {
            logger.error('No se recibió transacción válida.');
            return false;
        }

        logger.info('3. Firmando y enviando la transacción...');
        const swapTransactionBuf = Buffer.from(swapResult.swapTransaction, 'base64');
        const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
        transaction.sign([wallet]);

        const txid = await connection.sendRawTransaction(transaction.serialize(), {
            skipPreflight: false,
            maxRetries: 3
        });

        logger.info(`4. Esperando confirmación...`);
        await connection.confirmTransaction(txid, 'confirmed');

        logger.info(`✅ ¡SWAP EXITOSO! Ver en Solscan: https://solscan.io/tx/${txid}`);
        return true;

    } catch (error: any) {
        logger.error("💥 ERROR DETALLADO al ejecutar el swap:");
        if (error.response) {
            logger.error(`Status: ${error.response.status}`);
            logger.error(`Data: ${JSON.stringify(error.response.data, null, 2)}`);
        } else {
            logger.error(`Error General: ${error.message}`);
        }
        return false;
    }
}

async function runManualBuyTest() {
    logger.info(`--- 🚀 Iniciando Prueba de Compra REAL para PENG ---`);
    
    const TEST_AMOUNT_USDC = 5;
    const amountInSmallestUnit = TEST_AMOUNT_USDC * Math.pow(10, USDC_DECIMALS);

    await performRealSwap(USDC_MINT, SOL_MINT, amountInSmallestUnit);

    logger.info(`--- ✅ Prueba de Compra REAL Finalizada. ---`);
}

runManualBuyTest();