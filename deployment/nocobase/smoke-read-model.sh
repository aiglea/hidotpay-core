#!/bin/sh
set -eu

base="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

test -s "$base/bootstrap-read-model.mjs"
test -s "$base/read-model-schema.mjs"
test -s "$base/read-model-role.mjs"
test -s "$base/bootstrap-read-model-acl.mjs"
test -s "$base/read-model-service-user.mjs"
grep -q 'hidotpay_admin_projection_status' "$base/read-model-schema.mjs"
grep -q 'hidotpay_admin_ledger_transactions' "$base/read-model-schema.mjs"
grep -q 'source_id' "$base/read-model-schema.mjs"
grep -q "name: 'updateOrCreate'" "$base/read-model-role.mjs"
grep -q 'hidotpay_admin_read_model_writer' "$base/read-model-role.mjs"
if grep -Eiq 'private.?key|mnemonic|seed|signer|encrypted_payload|withdrawals:approve|custom-request|data-source-manager' \
  "$base/read-model-schema.mjs" "$base/read-model-role.mjs" "$base/read-model-service-user.mjs"; then
  echo 'NocoBase read-model bootstrap contains prohibited custody or control material' >&2
  exit 1
fi
node --test "$base/read-model-schema.test.mjs" "$base/read-model-role.test.mjs" \
  "$base/read-model-role-bootstrap.test.mjs" "$base/read-model-service-user.test.mjs"
