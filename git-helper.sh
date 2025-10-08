#!/bin/bash
# Git Helper Script - Quick commands for common Git operations

case "$1" in
  status)
    echo "📊 Git Status:"
    git status
    ;;

  log)
    echo "📜 Recent Commits:"
    git log --oneline --graph -10
    ;;

  push)
    echo "🚀 Pushing to GitHub..."
    git push origin main
    echo "✅ Push complete! View at: https://github.com/Kba-Notes/trading-bot-solana"
    ;;

  pull)
    echo "⬇️  Pulling from GitHub..."
    git pull origin main
    ;;

  diff)
    echo "📝 Changes not yet committed:"
    git diff
    ;;

  uncommitted)
    echo "📋 Files with uncommitted changes:"
    git status --short
    ;;

  *)
    echo "Git Helper Commands:"
    echo "  ./git-helper.sh status      - Show git status"
    echo "  ./git-helper.sh log         - Show recent commits"
    echo "  ./git-helper.sh push        - Push to GitHub"
    echo "  ./git-helper.sh pull        - Pull from GitHub"
    echo "  ./git-helper.sh diff        - Show uncommitted changes"
    echo "  ./git-helper.sh uncommitted - List files with changes"
    ;;
esac
