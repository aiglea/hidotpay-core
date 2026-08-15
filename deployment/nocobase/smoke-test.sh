#!/bin/sh
set -eu

: "${HIDOTPAY_NOCOBASE_APP_KEY:?HIDOTPAY_NOCOBASE_APP_KEY is required}"
: "${HIDOTPAY_NOCOBASE_DB_PASSWORD:?HIDOTPAY_NOCOBASE_DB_PASSWORD is required}"

docker compose -f "$(dirname "$0")/docker-compose.development.yaml" config --quiet
if grep -Eiq 'wallet_key_versions|signer_key_ref|private.?key|mnemonic|seed' "$(dirname "$0")/finance-reader-grants.sql"; then
  echo "reader grants contain prohibited custody data" >&2
  exit 1
fi
