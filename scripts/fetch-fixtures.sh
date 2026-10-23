#!/usr/bin/env bash
# Downloads the Metaplex programs and the Squads v4 program (with its
# program-config account) that the tests load into the local validator (see
# scripts/test-local.sh). They are devnet dumps, not committed.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p tests/fixtures
dump() { solana program dump -u devnet "$1" "tests/fixtures/$2.so"; }
dump BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY mpl_bubblegum
dump CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d mpl_core
dump mnoopTCrg4p8ry25e4bcWA9XZjbNjMTfgYVGGEdRsf3 mpl_noop
dump mcmt6YrQEMKw8Mw43FmpRLmf7BqRnFMKmAcbxE3xkAW mpl_account_compression
dump SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf squads_v4
# Squads ProgramConfig PDA (fee settings + treasury), needed to create a multisig.
solana account -u devnet BSTq9w3kZwNwpBXJEvTZz2G9ZTNyKBvoSeXMvwb4cNZr --output json -o tests/fixtures/squads_program_config.json >/dev/null
