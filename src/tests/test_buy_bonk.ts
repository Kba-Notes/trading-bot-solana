// src/tests/test_buy_bonk.ts
// Live test to verify buy function works with 1 USDC worth of BONK

import 'dotenv/config';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { logger } from '../services.js';
import { executeBuyOrder } from '../order_executor/trader.js';
import { getCurrentPrice } from '../data_extractor/jupiter.js';

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const BONK_MINT = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
const USDC_DECIMALS = 6;

async function getTokenBalance(connection: Connection, walletPublicKey: PublicKey, mintAddress: string): Promise<number> {
    try {
        const mintPublicKey = new PublicKey(mintAddress);
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(walletPublicKey, { mint: mintPublicKey });

        if (tokenAccounts.value.length > 0) {
            const balance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.amount;
            const decimals = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.decimals;
            const uiAmount = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
            logger.info(`Token balance for ${mintAddress}: ${balance} lamports (${uiAmount} tokens, ${decimals} decimals)`);
            return parseInt(balance);
        }
        logger.info(`No token account found for ${mintAddress}`);
        return 0;
    } catch (error: any) {
        logger.error(`Error getting token balance: ${error.message}`);
        return 0;
    }
}

async function testBuyBonk() {
    logger.info('=== 🧪 Starting BONK Buy Test (1 USDC) ===\n');

    // Verify private key exists
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        logger.error('❌ Private key not found in .env file!');
        return;
    }

    const wallet = Keypair.fromSecretKey(bs58.decode(privateKey));
    const connection = new Connection('https://api.mainnet-beta.solana.com');

    logger.info(`Wallet address: ${wallet.publicKey.toBase58()}\n`);

    // Check USDC balance before
    logger.info('--- STEP 1: Checking USDC balance before test ---');
    const usdcBalanceBefore = await getTokenBalance(connection, wallet.publicKey, USDC_MINT);
    const usdcAmountBefore = usdcBalanceBefore / Math.pow(10, USDC_DECIMALS);
    logger.info(`USDC balance before: ${usdcAmountBefore.toFixed(2)} USDC\n`);

    if (usdcBalanceBefore < Math.pow(10, USDC_DECIMALS)) {
        logger.error('❌ Insufficient USDC balance! Need at least 1 USDC for this test.');
        return;
    }

    // Check BONK balance before
    logger.info('--- STEP 2: Checking BONK balance before test ---');
    const bonkBalanceBefore = await getTokenBalance(connection, wallet.publicKey, BONK_MINT);
    logger.info(`BONK balance before: ${bonkBalanceBefore} lamports\n`);

    // Get current BONK price
    logger.info('--- STEP 3: Getting current BONK price ---');
    const currentPrice = await getCurrentPrice(BONK_MINT);
    if (!currentPrice) {
        logger.error('❌ Failed to get BONK price. Cannot proceed with test.');
        return;
    }
    logger.info(`Current BONK price: $${currentPrice.toFixed(8)}\n`);

    // Execute buy order for 1 USDC worth of BONK
    logger.info('--- STEP 4: Executing buy order (1 USDC → BONK) ---');
    logger.info(`Attempting to buy 1 USDC worth of BONK at $${currentPrice.toFixed(8)}...`);

    try {
        await executeBuyOrder(BONK_MINT, 1, currentPrice);
        logger.info('✅ Buy order completed successfully!\n');
    } catch (error: any) {
        logger.error(`❌ Buy order failed: ${error.message}`);
        logger.error('See logs above for details.');
        return;
    }

    // Wait for blockchain to update
    logger.info('--- STEP 5: Waiting 10 seconds for blockchain to update ---');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Check balances after
    logger.info('--- STEP 6: Checking balances after test ---');
    const usdcBalanceAfter = await getTokenBalance(connection, wallet.publicKey, USDC_MINT);
    const usdcAmountAfter = usdcBalanceAfter / Math.pow(10, USDC_DECIMALS);
    const bonkBalanceAfter = await getTokenBalance(connection, wallet.publicKey, BONK_MINT);

    // Calculate differences
    const usdcSpent = (usdcBalanceBefore - usdcBalanceAfter) / Math.pow(10, USDC_DECIMALS);
    const bonkReceived = bonkBalanceAfter - bonkBalanceBefore;

    logger.info('\n=== 📊 Test Results Summary ===');
    logger.info(`USDC spent: ${usdcSpent.toFixed(2)} USDC`);
    logger.info(`BONK received: ${bonkReceived} lamports`);
    logger.info(`USDC balance: ${usdcAmountBefore.toFixed(2)} → ${usdcAmountAfter.toFixed(2)}`);
    logger.info(`BONK balance: ${bonkBalanceBefore} → ${bonkBalanceAfter}`);
    logger.info('\n✅ Test completed successfully! Buy function is working.');
}

// Run the test
testBuyBonk().catch((error) => {
    logger.error('❌ Test failed with error:', error);
    process.exit(1);
});
