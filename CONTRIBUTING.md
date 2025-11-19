# Contributing to Trading Bot

## Documentation Workflow

**CRITICAL RULE**: Every code change to `src/` files **MUST** update documentation before committing.

### Required Updates

When modifying source code (`src/**/*.ts`), you **MUST** update:

1. **CHANGELOG.md** - User-facing changes
   - Add entry under appropriate version
   - Include: What changed, Why, Impact
   - Use [Keep a Changelog](https://keepachangelog.com/) format

2. **SESSION_MEMORY.md** - Technical chronological log
   - Add numbered entry with full implementation details
   - Update "Current Strategy Configuration" if applicable
   - Include file paths, line numbers, rationale

### Automated Enforcement

A git pre-commit hook **blocks commits** if:
- You modify `src/` files, but
- Don't stage `CHANGELOG.md` **AND** `SESSION_MEMORY.md`

**Example blocked commit:**
```bash
$ git commit -m "fix: update trailing stop"

❌ COMMIT BLOCKED: Documentation not updated

You modified source files but didn't update documentation:

Modified src/ files:
  - src/bot.ts

  ⚠️  CHANGELOG.md not staged
  ⚠️  SESSION_MEMORY.md not staged

Required actions:
  1. Update CHANGELOG.md with user-facing changes
  2. Update SESSION_MEMORY.md chronological entry
  3. Stage both files: git add CHANGELOG.md SESSION_MEMORY.md
```

### Correct Workflow

```bash
# 1. Make code changes
vim src/bot.ts

# 2. Update documentation (BEFORE committing)
vim CHANGELOG.md        # Add user-facing changes
vim SESSION_MEMORY.md   # Add technical details

# 3. Stage everything together
git add src/bot.ts CHANGELOG.md SESSION_MEMORY.md

# 4. Commit (hook will allow)
git commit -m "feat: description"
```

### Bypassing the Hook

**NOT RECOMMENDED**, but possible for emergency hotfixes:
```bash
git commit --no-verify
```

You should still update docs afterward!

## Hook Installation

The hook is located at `.git/hooks/pre-commit` and should already be executable.

To reinstall:
```bash
chmod +x .git/hooks/pre-commit
```

## Why This Matters

1. **Context Preservation**: Future sessions need complete history
2. **User Understanding**: CHANGELOG shows what changed and why
3. **Debugging**: SESSION_MEMORY has technical details for troubleshooting
4. **Professionalism**: Documented projects are maintainable projects

---

**Remember**: Code without documentation is incomplete code!
