#!/usr/bin/env bash
# Downloads the Metaplex programs the tests load into the local validator
# (see scripts/test-local.sh). They are devnet dumps, not committed.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p tests/fixtures
dump() { solana program dump -u devnet "$1" "tests/fixtures/$2.so"; }
dump BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY mpl_bubblegum
dump CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d mpl_core
dump mnoopTCrg4p8ry25e4bcWA9XZjbNjMTfgYVGGEdRsf3 mpl_noop
dump mcmt6YrQEMKw8Mw43FmpRLmf7BqRnFMKmAcbxE3xkAW mpl_account_compression
