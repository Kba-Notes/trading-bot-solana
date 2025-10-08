# GitHub Best Practices for Trading Bot Development

**Repository**: https://github.com/Kba-Notes/trading-bot-solana

This document outlines the best practices we follow for version control and collaboration.

## Commit Frequency

✅ **DO:**
- Commit after each logical feature or fix
- Commit multiple times per day during active development
- Push at least once per day (end of work session)
- Create checkpoint commits before risky refactors

❌ **DON'T:**
- Wait days/weeks to commit
- Batch unrelated changes in one commit
- Commit untested code to main branch

## Commit Message Format

We follow the Conventional Commits specification:

```
<type>: <short description>

<optional detailed body>

<optional footer>
```

### Types:
- `feat:` - New feature
- `fix:` - Bug fix
- `refactor:` - Code restructuring (no behavior change)
- `docs:` - Documentation only
- `test:` - Adding or updating tests
- `chore:` - Build/tooling/dependencies
- `perf:` - Performance improvement

### Examples:

```bash
# Good commit messages
git commit -m "feat: add position persistence to prevent data loss"
git commit -m "fix: update Jupiter API from v6 to v1 endpoints"
git commit -m "refactor: extract strategy into GoldenCrossStrategy class"
git commit -m "docs: add comprehensive JSDoc to utility functions"

# Bad commit messages (avoid these)
git commit -m "update"
git commit -m "fix stuff"
git commit -m "WIP"
git commit -m "asdfasdf"
```

## Branching Strategy

We use **GitHub Flow** (simplified Git Flow):

```
main (production-ready code)
  ├── feature/add-metrics
  ├── feature/position-persistence
  ├── fix/api-endpoint-update
  └── refactor/strategy-class
```

### Workflow:

```bash
# 1. Create feature branch from main
git checkout main
git pull origin main
git checkout -b feature/performance-metrics

# 2. Make changes and commit
git add src/monitoring/metrics.ts
git commit -m "feat: add performance metrics tracking"

# 3. Push to GitHub
git push -u origin feature/performance-metrics

# 4. Create Pull Request on GitHub
# 5. After review/approval, merge to main
# 6. Delete feature branch

git checkout main
git pull origin main
git branch -d feature/performance-metrics
```

## What to Commit vs. Ignore

### ✅ ALWAYS Commit:
- Source code (`src/**/*.ts`)
- Tests (`src/tests/**`)
- Configuration (`package.json`, `tsconfig.json`)
- Documentation (`README.md`, `docs/**`)
- `.gitignore`
- `.env.example` (template only!)

### ❌ NEVER Commit:
- `.env` (contains secrets!)
- `node_modules/` (dependencies)
- `dist/` (build output)
- `data/` (runtime data)
- `*.log` (log files)
- Private keys, wallets, credentials

**Our `.gitignore` protects you from accidentally committing secrets.**

## Security Checklist

Before every push, verify:

```bash
# 1. Check for secrets
git log --all --full-history -- .env
# Should return nothing

# 2. Review what will be pushed
git diff origin/main

# 3. Verify .gitignore is working
git status --ignored | grep .env
# Should show .env as ignored

# 4. Check for hardcoded secrets in code
grep -r "PRIVATE_KEY" src/
# Should only find references to process.env.PRIVATE_KEY
```

## Daily Workflow

### Morning:
```bash
git checkout main
git pull origin main
# Start working...
```

### During Development:
```bash
# After completing a feature
git add <files>
git commit -m "feat: meaningful description"

# Every 2-3 commits or at natural break points
git push origin main
```

### End of Day:
```bash
# Always push before ending work session
git push origin main
```

## Pull Request Best Practices

### PR Title Format:
Same as commit messages:
```
feat: add performance metrics and monitoring
fix: resolve API timeout issues
refactor: extract trading strategy into class
```

### PR Description Template:
```markdown
## What Changed
- Added performance metrics tracking
- Integrated metrics into heartbeat messages

## Why
- Need visibility into bot performance
- Track API success rates and execution times

## Testing
- [x] Code compiles successfully
- [x] Bot running for 2 hours without errors
- [x] Metrics appearing in logs and Telegram

## Checklist
- [x] No secrets committed
- [x] Tests pass
- [x] Documentation updated
- [x] Code reviewed
```

## Release Versioning

We use **Semantic Versioning** (SemVer):

```
v1.0.0 - Initial release
v1.1.0 - New feature (minor)
v1.1.1 - Bug fix (patch)
v2.0.0 - Breaking change (major)
```

### Creating a Release:

```bash
# After merging significant changes
git checkout main
git pull origin main

# Create tag
git tag -a v2.0.0 -m "feat: major refactor with best practices implementation"

# Push tag
git push origin v2.0.0

# Create GitHub Release
# Go to: https://github.com/Kba-Notes/trading-bot-solana/releases
# Click "Draft a new release"
# Select tag v2.0.0
# Add release notes
```

## Code Review Guidelines

When reviewing PRs:

✅ **Check for:**
- Clear commit messages
- No secrets in code
- Tests included (if applicable)
- Documentation updated
- Code follows project style
- No `console.log` debug statements left

❌ **Red Flags:**
- Hardcoded API keys or private keys
- Disabled tests
- Commented-out code blocks
- Missing error handling

## Common Git Commands Reference

```bash
# Status and diff
git status                           # Check current state
git diff                            # See unstaged changes
git diff --staged                   # See staged changes
git log --oneline --graph           # View commit history

# Branching
git branch                          # List branches
git checkout -b feature/new         # Create and switch to new branch
git branch -d feature/old           # Delete merged branch

# Undoing changes
git checkout -- file.ts             # Discard changes to file
git reset HEAD file.ts              # Unstage file
git reset --soft HEAD~1             # Undo last commit (keep changes)
git reset --hard HEAD~1             # Undo last commit (discard changes)

# Stashing
git stash                           # Save changes temporarily
git stash pop                       # Restore stashed changes
git stash list                      # View stashed changes

# Remote
git remote -v                       # View remotes
git fetch origin                    # Fetch from remote
git pull origin main                # Fetch and merge
git push origin main                # Push to remote
```

## Emergency: Accidentally Committed Secrets

**If you accidentally commit secrets:**

1. **Immediately rotate ALL secrets** (private keys, API keys, tokens)
2. Remove from Git history:
   ```bash
   # For recent commit
   git reset --hard HEAD~1
   git push --force origin main  # DANGEROUS - use with caution

   # For older commits (complex, better to start fresh repo)
   ```
3. **Better approach**: Consider the secrets compromised and rotate them
4. Update `.env` with new secrets
5. Verify `.gitignore` is working

## Resources

- [Conventional Commits](https://www.conventionalcommits.org/)
- [GitHub Flow](https://guides.github.com/introduction/flow/)
- [Semantic Versioning](https://semver.org/)
- Repository: https://github.com/Kba-Notes/trading-bot-solana

---

**Remember**: Commit often, push daily, never commit secrets! 🔐
