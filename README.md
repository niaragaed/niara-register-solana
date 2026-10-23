# niara-register-solana

Solana program for **Niara Register** — on-chain proof of existence and authorship
for documents. Only the document's SHA-256 hash is recorded; the file itself never
leaves the user's browser.

It is the Solana port of `RegistroAssinaturas.sol`
([niaragaed/niara-contracts-Register](https://github.com/niaragaed/niara-contracts-Register)),
with the same rules. That contract is live at the same address,
`0x5627857ee73f37d6da96530ed08c07339dd9d93a`, on Ethereum Sepolia, Base
Sepolia, Robinhood Chain Testnet, HyperEVM Testnet and Tempo Testnet. Together
they let Niara Register record and verify the same document on six networks.

> Complementary evidentiary record. It does **not** replace a notary (cartório) or
> ICP-Brasil and has no automatic legal effect.

## v2 (needs a program upgrade)

- **`register_v2`** stores the record hash, the hash scheme, a public document type code (fixed list, same codes as `SignatureRegistryV2`) and a salted metadata commitment — never the document name — and mints a **soulbound compressed NFT receipt** (Metaplex Bubblegum v2) to the signer in the same transaction. Receipts live in an MPL-Core collection with `PermanentFreezeDelegate { frozen: true }` held by the program's `receipt_authority` PDA, so not even the owner can transfer them (the tests prove it with a valid Merkle proof). Wallets show them only through an RPC with the DAS API.
- **`registrar` (v1) is removed**: it wrote the name and type in plain text. Old v1 accounts stay readable, and a hash with a v1 record cannot be registered again.
- **Transferable records** (`issue_record`, `transfer_control`, `propose_amendment`, `cancel_amendment`, `accept_amendment`, `surrender`, `terminate`), designed to line up with MLETR. Aligned with MLETR, not "compliant": Brazil has not enacted it.

After upgrading the program (`anchor build`, then `solana program deploy` with the upgrade-authority wallet), create the receipt tree and collection once:

```bash
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
ANCHOR_WALLET=<upgrade-authority keypair> \
METADATA_BASE_URL=https://niara-register.vercel.app/api/receipts/solana/ \
npx ts-node scripts/setup-receipts.ts
```

Tests: `bash scripts/fetch-fixtures.sh` once, then `anchor build --ignore-keys && bash scripts/test-local.sh` (local validator with the Metaplex programs loaded).

## Live on Solana devnet

- Program: [`9RPHqLouFjoUbPdcmA1GyHMeDoWvjZMuCyYFPBWLmTcR`](https://explorer.solana.com/address/9RPHqLouFjoUbPdcmA1GyHMeDoWvjZMuCyYFPBWLmTcR?cluster=devnet)
  — deployed at slot 509235352, upgrade authority held by the Niara deployer wallet
- First real registration: [`4eFgDjZ6…cQBj`](https://explorer.solana.com/tx/4eFgDjZ6dzJzraZHGEoqxawxGaynttCUUUeUQkAtbCRnin9j6pMzMUEyB72Tmqyfa5YkbA6CA5CJYQ6jVjNMcQBj?cluster=devnet)
- Web app: [niara-register.vercel.app/signatures](https://niara-register.vercel.app/signatures). Pick
  **Solana Devnet**, drop a file, and sign with Phantom or Solflare. The ledger below the form
  mirrors records from all six networks side by side: Solana Devnet, Ethereum Sepolia, Base
  Sepolia, Robinhood Chain Testnet, HyperEVM Testnet and Tempo Testnet. The indexer is in
  [niaragaed/Niara-Register](https://github.com/niaragaed/Niara-Register) (`indexer/solana.ts`
  for Solana, `indexer/evm-assinaturas.ts` for the EVM networks).

## How it works (v1, as deployed today)

This section describes the program currently on devnet. After the v2 upgrade above, `registrar` no longer exists and new records go through `register_v2`.

| | |
|---|---|
| Program ID (devnet) | `9RPHqLouFjoUbPdcmA1GyHMeDoWvjZMuCyYFPBWLmTcR` |
| Framework | Anchor 1.2.1, Agave 4.x |
| Instruction | `registrar(hash_documento: [u8; 32], nome_documento: String, tipo_documento: String)` |
| Record account | PDA `["assinatura", hash_documento]` → `Assinatura { assinante, hash_documento, timestamp, slot, nome_documento, tipo_documento, bump }` |
| Event | `DocumentoRegistrado { hash_documento, assinante, nome_documento, tipo_documento, timestamp, slot }` |

- **One record per hash, immutable.** The record address is derived from the hash
  itself, and `init` fails if it already exists — nobody can overwrite or back-date
  a document, including the original signer.
- **Self-custody.** The signer's own wallet signs and pays the rent
  (~0.0027 SOL per record). Niara never holds keys or documents.
- **Verification needs no wallet.** Anyone with the file can recompute the hash,
  derive the PDA and read the account.
- Validation: hash cannot be all zeros; name 1–128 bytes, type 1–32 bytes (UTF-8,
  trimmed).

Errors: `HashInvalido` (6000), `NomeInvalido` (6001), `TipoInvalido` (6002);
duplicate hash fails with the System Program's "already in use".

## Run the tests

```bash
bash scripts/fetch-fixtures.sh          # once: Metaplex programs from devnet
anchor build --ignore-keys
bash scripts/test-local.sh
```

15 tests: receipt infrastructure (frozen collection held by the program PDA,
admin-only config), `register_v2` (no readable metadata, the receipt leaf
rebuilt and matched against the on-chain tree root, transfer refused even for
the owner, duplicate/zero/unknown-scheme/foreign-tree rejection), and the full
transferable-record life-cycle.

## Deploy to devnet

```bash
solana config set --url devnet
solana airdrop 2            # or https://faucet.solana.com
anchor deploy --provider.cluster devnet
```

The program ID above requires `target/deploy/niara_register_solana-keypair.json`
(kept out of git). Deploying with a new keypair: run `anchor keys sync`, rebuild,
and update `SOLANA_PROGRAM_ID` in the Niara-Register site
(`lib/register-solana.ts`).

## Web client

The Niara-Register site (`/signatures`, `/verify`, `/transferable`) talks to this
program without the Anchor client: `lib/register-v2-solana.ts` encodes the
instructions and decodes the accounts by hand (discriminators from `target/idl/niara_register_solana.json`), and the
wallet (Phantom/Solflare) only signs — the transaction is sent through a devnet RPC.

## Known limitations

- Same as the EVM version: whoever lands the first transaction for a hash becomes
  its signer. A commit–reveal or multi-signer record (one PDA per
  `[hash, signer]`) is on the roadmap for contracts with several parties.
- Devnet only for now. Mainnet comes after an external audit.

## Development history (disclosure)

The EVM contract this program ports, the Niara-Register site and its Sepolia
indexer were built in September 2026. Everything else was written in October
2026, during the Crypto World's Fair hackathon: this Solana program, the site's
Solana integration, the multichain ledger and indexers, and the EVM deployments
on Base, Robinhood Chain, HyperEVM and Tempo.
