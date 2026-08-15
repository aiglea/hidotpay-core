# This policy belongs only to the signer workload identity.
# The public API, ledger API, NocoBase, and browser clients must never receive it.
path "transit/encrypt/hidotpay-wallet-envelope" {
  capabilities = ["update"]
}

path "transit/decrypt/hidotpay-wallet-envelope" {
  capabilities = ["update"]
}

path "transit/keys/hidotpay-wallet-envelope" {
  capabilities = ["read"]
}
