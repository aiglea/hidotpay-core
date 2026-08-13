#!/bin/zsh
set -euo pipefail

WORKTREE='/Volumes/SING_02/.codex-worktrees/hidotpay-financial-core'
export PATH='/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'

DATABASE_URL=$(security find-generic-password -w -s 'hidotpay-development-database-url')
DEVELOPMENT_API_KEY=$(security find-generic-password -w -s 'hidotpay-development-api-key')

exec /usr/bin/env \
  NODE_ENV=development \
  HOST=127.0.0.1 \
  PORT=3001 \
  DATABASE_URL="$DATABASE_URL" \
  DEVELOPMENT_API_KEY="$DEVELOPMENT_API_KEY" \
  WITHDRAWAL_FEE_SCHEDULE='{"ethereum:USDT":"10000"}' \
  /opt/homebrew/bin/npm run start:ledger --prefix "$WORKTREE"
