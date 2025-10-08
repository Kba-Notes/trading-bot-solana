# 🧠 Session Memory - Important Information

This document contains critical information that should be remembered across all Claude Code sessions.

---

## 🔐 GitHub Authentication

**Status**: ✅ Fully configured and automated

### Credentials Location
```
/root/.github-credentials
```

This file contains:
- `GITHUB_TOKEN` - Personal Access Token for authentication
- `GITHUB_USERNAME` - Kba-Notes
- `GITHUB_EMAIL` - miguelcabanasb@gmail.com
- `GITHUB_REPO` - Repository URL

### How to Use in Future Sessions
```bash
# Read credentials
source /root/.github-credentials

# Credentials are automatically used by git
git push origin main
```

**⚠️ IMPORTANT**: This file is in `.gitignore` and will NEVER be committed.

---

## 📝 Project Context

**Context File Location**:
```
/root/trading-bot/.claude-context
```

This file contains:
- Project information (name, type, structure)
- Owner information (name, email, GitHub)
- Key features implemented
- Trading strategy details
- Best practices to follow
- Common commands
- Session workflow

**Start every new session by reading this file!**

---

## 🎯 Repository Information

- **Repository**: https://github.com/Kba-Notes/trading-bot-solana
- **Owner**: Kba-Notes (Miguel Cabanas - miguelcabanasb@gmail.com)
- **Language**: English (ALWAYS use English for everything)
- **Status**: Production-ready, running on Hetzner server

---

## 📋 GitHub Best Practices (ALWAYS FOLLOW)

### Commit Message Format
```
<type>: <description>

Types:
- feat:     New feature
- fix:      Bug fix
- refactor: Code restructuring
- docs:     Documentation
- test:     Tests
- chore:    Build/tooling
- perf:     Performance
```

### Workflow for Every Change
1. ✍️ Make code changes
2. 📝 Create atomic commits with clear messages
3. 🚀 Push to GitHub automatically
4. ✅ Verify on GitHub

### What to NEVER Commit
- `.env` (secrets)
- `data/` (runtime data)
- `*.log` (logs)
- `.github-credentials` (GitHub token)
- `.claude-context` (session context)

---

## 🤖 Bot Information

### Location
```
/root/trading-bot
```

### Process Manager
```bash
pm2 list              # Check status
pm2 logs trading-bot  # View logs
pm2 restart trading-bot  # Restart after changes
```

### Build Command
```bash
npm run build
```

---

## 🔄 Typical Session Workflow

### At Start of Session:
```bash
# 1. Read context
cat /root/trading-bot/.claude-context

# 2. Check credentials
cat /root/.github-credentials

# 3. Check bot status
pm2 list | grep trading-bot
```

### During Session:
- Make requested changes
- Follow best practices
- Create proper commits
- Push automatically to GitHub

### At End of Session:
- Ensure all changes are pushed
- Update `.claude-context` if needed
- Verify bot is running

---

## 📚 Key Documentation

All documentation is in the repository:
- `GITHUB_BEST_PRACTICES.md` - Complete guide
- `GITHUB_SETUP_COMPLETE.md` - Setup documentation
- `docs/analysis_report.md` - Code analysis
- `.env.example` - Configuration template
- `README.md` - Project overview

---

## 🎨 Code Style Guidelines

1. **Language**: ALWAYS English
2. **Comments**: JSDoc format with `@param`, `@returns`, `@throws`
3. **Naming**: camelCase for variables/functions, PascalCase for classes
4. **Errors**: Use custom error types from `src/errors/`
5. **Constants**: Use values from `src/constants.ts`
6. **Validation**: Validate inputs using `src/utils/validation.ts`

---

## 🚨 Critical Reminders

⚠️ **ALWAYS** read `/root/.github-credentials` before pushing
⚠️ **ALWAYS** read `/root/trading-bot/.claude-context` at session start
⚠️ **ALWAYS** use English (never Spanish)
⚠️ **ALWAYS** follow Conventional Commits format
⚠️ **ALWAYS** push to GitHub after changes
⚠️ **NEVER** commit secrets or credentials
⚠️ **NEVER** hardcode sensitive values

---

## 🎯 Quick Reference

### Push to GitHub
```bash
cd /root/trading-bot
git add <files>
git commit -m "type: description"
git push origin main
```

### Check What Changed
```bash
git status
git diff
git log --oneline -5
```

### Verify No Secrets
```bash
git diff --cached  # Review before committing
git status --ignored | grep .env  # Verify .env ignored
```

---

## 📞 Contact Information

**Owner**: Miguel Cabanas
**Email**: miguelcabanasb@gmail.com
**GitHub**: @Kba-Notes
**Repository**: https://github.com/Kba-Notes/trading-bot-solana

---

## ✅ Setup Status

- [x] GitHub authentication configured
- [x] Credentials stored securely
- [x] Context file created
- [x] Best practices documented
- [x] .gitignore protecting secrets
- [x] Bot running in production
- [x] All improvements implemented

**Last Updated**: 2025-10-08 (Latest session)
**Status**: ✅ Ready for continuous development

---

## 🎯 Recent Improvements (Latest Session)

### ✅ Completed Features

1. **Enhanced Telegram Notifications** (Commits: 9555963, b69ac51)
   - Detailed BUY/SELL notifications with all technical indicators
   - Analysis cycle summaries after each run
   - Position check notifications
   - Better visibility without spam

2. **Trend Strength Filter** (Commit: c13bfd1)
   - Added SMA slope filter (0.1% minimum requirement)
   - Prevents buying into exhausted trends
   - Filters false Golden Cross signals
   - Expected: +10-20% win rate improvement

3. **Volatility Filter** (Commit: c13bfd1)
   - Calculates 20-period average volatility
   - Pauses trading if volatility > 5%
   - Avoids choppy, whipsaw conditions
   - Reduces premature stop-outs

4. **Trailing Stop Loss** (Commit: 7dcbbf2)
   - Activates when position reaches +2% profit
   - Trails 2% below highest price seen
   - Protects profits while letting winners run
   - Persists state across bot restarts
   - Expected: Better average win size

### 📊 Current Strategy Improvements

**Entry Conditions (Enhanced)**:
- Market Health Index > 0
- Golden Cross: SMA(12) > SMA(26)
- RSI(14) > 50
- **NEW**: SMA slope > 0.1% (trend strength)
- **NEW**: Volatility < 5% (market stability)

**Exit Conditions (Enhanced)**:
- Take Profit: +4%
- Stop Loss: -2%
- **NEW**: Trailing stop @ 2% below highest price (after +2% profit)

**Expected Results**:
- Win Rate: 55-65% (up from 45-55%)
- Better R:R ratio with trailing stops
- Fewer false signals
- More consistent returns

---

**Remember**: This information persists across sessions. Always refer to these files when starting a new session!
