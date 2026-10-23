#!/usr/bin/env bash
# Runs the program tests against a local validator that has the Metaplex
# programs (Bubblegum, MPL-Core, noop, account compression) and Squads v4
# loaded from tests/fixtures, and this program loaded as UPGRADEABLE at its real address
# with the local wallet as upgrade authority (initialize_config checks it).
#
# Usage: bash scripts/fetch-fixtures.sh (once), then: anchor build --ignore-keys && bash scripts/test-local.sh
# (--ignore-keys: the program keypair is not in the repo; the test validator
# loads the binary at the real program id instead.)
set -euo pipefail
cd "$(dirname "$0")/.."

WALLET="${ANCHOR_WALLET:-$HOME/.config/solana/id.json}"
PROGRAM_ID=9RPHqLouFjoUbPdcmA1GyHMeDoWvjZMuCyYFPBWLmTcR
LEDGER=$(mktemp -d)

solana-test-validator --reset --quiet --ledger "$LEDGER" \
  --bpf-program BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY tests/fixtures/mpl_bubblegum.so \
  --bpf-program CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d tests/fixtures/mpl_core.so \
  --bpf-program mnoopTCrg4p8ry25e4bcWA9XZjbNjMTfgYVGGEdRsf3 tests/fixtures/mpl_noop.so \
  --bpf-program mcmt6YrQEMKw8Mw43FmpRLmf7BqRnFMKmAcbxE3xkAW tests/fixtures/mpl_account_compression.so \
  --bpf-program SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf tests/fixtures/squads_v4.so \
  --account BSTq9w3kZwNwpBXJEvTZz2G9ZTNyKBvoSeXMvwb4cNZr tests/fixtures/squads_program_config.json \
  --upgradeable-program "$PROGRAM_ID" target/deploy/niara_register_solana.so "$WALLET" &
VALIDATOR=$!
trap 'kill $VALIDATOR 2>/dev/null; rm -rf "$LEDGER"' EXIT

for _ in $(seq 1 60); do
  solana -u localhost cluster-version >/dev/null 2>&1 && break
  sleep 1
done
solana -u localhost airdrop 100 "$(solana-keygen pubkey "$WALLET")" >/dev/null

ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 ANCHOR_WALLET="$WALLET" \
  npx ts-mocha -p ./tsconfig.json -t 1000000 "tests/**/*.ts"
