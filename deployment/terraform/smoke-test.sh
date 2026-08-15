#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname "$0")" && pwd)

for file in versions.tf variables.tf network.tf iam.tf eks.tf outputs.tf; do
  test -s "$root/$file" || {
    echo "missing Terraform file: $file" >&2
    exit 1
  }
done

grep -q 'required_providers' "$root/versions.tf"
grep -q 'availability_zones' "$root/network.tf"
grep -q 'slice(.*0, 3)' "$root/network.tf"
grep -q 'endpoint_public_access *= *false' "$root/eks.tf"
grep -q 'encryption_config' "$root/eks.tf"
grep -q 'AmazonEKSClusterPolicy' "$root/iam.tf"
grep -q 'AmazonEKSWorkerNodePolicy' "$root/iam.tf"

if grep -R -Eiq '(private.?key|mnemonic|seed|root.?token|access_key|secret_key)' "$root" --include='*.tf'; then
  echo 'Terraform configuration must not contain credentials or custody material' >&2
  exit 1
fi

echo 'Terraform static safety checks passed'
