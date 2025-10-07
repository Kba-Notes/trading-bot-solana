# Trading Bot - Quick Start Guide

## ✅ Status: OPERATIONAL

The bot is now working correctly after fixing the Jupiter API integration.

## Recent Fixes (Oct 7, 2025)

- **CRITICAL**: Updated Jupiter API from v6 to v1 endpoints
- **VERIFIED**: Successfully executed test swap on mainnet
- **IMPROVED**: Added transaction optimization and error handling

## Quick Commands

### Check Bot Status
```bash
pm2 status trading-bot
pm2 logs trading-bot --lines 50
```

### Check Wallet Balances
```bash
npm run build
node --loader ts-node/esm src/tests/check_balance.test.ts
```

### Test Components
```bash
npm run test:price      # Test price fetching
npm run test:buy        # Test swap execution (USES REAL MONEY!)
```

### Deploy Updates
```bash
npm run build           # Compile TypeScript
pm2 restart trading-bot # Restart bot
pm2 save               # Save PM2 configuration
```

## Current Configuration

- **Trade Amount**: 500 USDC per trade
- **Take Profit**: +4%
- **Stop Loss**: -2%
- **Execution Interval**: Every 4 hours
- **Assets**: JUP, JTO, WIF, PENG, BONK

## Important Files

- `src/bot.ts` - Main bot logic
- `src/config.ts` - Configuration (amounts, assets, etc.)
- `src/order_executor/trader.ts` - Swap execution
- `.env` - Secrets (NEVER commit this!)

## Monitoring

### View Logs
```bash
tail -f trading-bot.log
tail -f error.log
```

### Check Recent Activity
```bash
grep "SWAP EXITOSO\|COMPRA\|VENTA" trading-bot.log | tail -10
```

## ⚠️ Important Warnings

1. **Security**: Your private key in `.env` is UNENCRYPTED
   - Never commit `.env` to git
   - Consider rotating keys periodically
   - Use a dedicated wallet for the bot

2. **API Limits**: 
   - Birdeye free tier: 100 requests/month
   - Current usage: ~1,080 requests/month ❌ OVER LIMIT
   - Consider upgrading to paid plan

3. **Risk Management**:
   - Start with small amounts
   - Monitor daily
   - Have a stop-loss plan (not just per-trade, but total portfolio)

## Next Steps

See the full analysis report at: `/tmp/trading_bot_analysis_report.md`

Priority actions:
1. [ ] Monitor performance for 1 week
2. [ ] Set up position persistence (positions lost on restart currently)
3. [ ] Consider upgrading Birdeye API plan
4. [ ] Implement trade history tracking
5. [ ] Backtest strategy on historical data

## Useful Links

- Transaction Explorer: https://solscan.io/
- Jupiter Swap: https://jup.ag/
- Jupiter Docs: https://dev.jup.ag/docs/

## Support

For issues:
1. Check logs first: `pm2 logs trading-bot`
2. Review error.log: `tail -100 error.log`
3. Test individual components with npm run test:*

**Good luck!** 🚀
