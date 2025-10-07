import 'dotenv/config';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { logger } from '../services.js';

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

async function checkBalances() {
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        logger.error('Clave privada no encontrada!');
        return;
    }

    const wallet = Keypair.fromSecretKey(bs58.decode(privateKey));
    const connection = new Connection('https://api.mainnet-beta.solana.com');

    logger.info('Wallet: ' + wallet.publicKey.toBase58());

    const solBalance = await connection.getBalance(wallet.publicKey);
    logger.info('Balance SOL: ' + (solBalance / 1e9) + ' SOL');

    try {
        const usdcMint = new PublicKey(USDC_MINT);
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
            wallet.publicKey,
            { mint: usdcMint }
        );

        if (tokenAccounts.value.length > 0) {
            const balance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
            logger.info('Balance USDC: ' + balance + ' USDC');
        } else {
            logger.info('Balance USDC: 0 USDC (no token account)');
        }
    } catch (error: any) {
        logger.error('Error checking USDC: ' + error.message);
    }
}

checkBalances();
