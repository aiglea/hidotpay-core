#!/bin/zsh
set -euo pipefail

WORKTREE='/Volumes/SING_02/.codex-worktrees/hidotpay-financial-core'
export PATH='/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'

DATABASE_URL=$(security find-generic-password -w -s 'hidotpay-development-database-url')
BLNK_API_KEY=$(security find-generic-password -w -s 'hidotpay-development-blnk-api-key')
SIGNER_DERIVATION_URL=$(security find-generic-password -w -s 'hidotpay-development-signer-derivation-url')
SIGNER_SERVICE_TOKEN=$(security find-generic-password -w -s 'hidotpay-development-signer-service-token')

exec /usr/bin/env \
  NODE_ENV=development \
  HOST=127.0.0.1 \
  PORT=3001 \
  DATABASE_URL="$DATABASE_URL" \
  LOGTO_ISSUER='https://ngu7sy.logto.app/oidc' \
  LOGTO_AUDIENCE='https://api-dev.hidotpay.com' \
  SIGNER_DERIVATION_URL="$SIGNER_DERIVATION_URL" \
  SIGNER_SERVICE_TOKEN="$SIGNER_SERVICE_TOKEN" \
  BLNK_URL='http://127.0.0.1:5001' \
  BLNK_KEY="$BLNK_API_KEY" \
  WITHDRAWAL_FEE_SCHEDULE='{"ethereum:USDT":"10000"}' \
  WITHDRAWALS_ENABLED=false \
  /opt/homebrew/bin/npm run start:ledger --prefix "$WORKTREE"
