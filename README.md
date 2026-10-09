# niara-register-solana

Solana program for **Niara Register** — on-chain proof of existence and authorship
for documents. Only the document's SHA-256 hash is recorded; the file itself never
leaves the user's browser.

It is the Solana port of `RegistroAssinaturas.sol`
([niaragaed/niara-contracts-Register](https://github.com/niaragaed/niara-contracts-Register),
live on Ethereum Sepolia), with the same rules, so Niara Register can record and
verify the same document on multiple chains.

> Complementary evidentiary record. It does **not** replace a notary (cartório) or
> ICP-Brasil and has no automatic legal effect.

## Live on Solana devnet

- Program: [`9RPHqLouFjoUbPdcmA1GyHMeDoWvjZMuCyYFPBWLmTcR`](https://explorer.solana.com/address/9RPHqLouFjoUbPdcmA1GyHMeDoWvjZMuCyYFPBWLmTcR?cluster=devnet)
  — deployed at slot 509235352, upgrade authority held by the Niara deployer wallet
- First real registration: [`4eFgDjZ6…cQBj`](https://explorer.solana.com/tx/4eFgDjZ6dzJzraZHGEoqxawxGaynttCUUUeUQkAtbCRnin9j6pMzMUEyB72Tmqyfa5YkbA6CA5CJYQ6jVjNMcQBj?cluster=devnet)
- Web app: [niara-register.vercel.app/signatures](https://niara-register.vercel.app/signatures) — pick
  **Solana Devnet**, drop a file, sign with Phantom/Solflare. The ledger below the form mirrors
  records from Solana devnet and Ethereum Sepolia side by side (indexer in
  [niaragaed/Niara-Register](https://github.com/niaragaed/Niara-Register), `indexer/solana.ts`).

## How it works

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
anchor build
solana-test-validator -r --bpf-program 9RPHqLouFjoUbPdcmA1GyHMeDoWvjZMuCyYFPBWLmTcR \
  target/deploy/niara_register_solana.so &
anchor test --skip-local-validator --skip-deploy --skip-build
```

7 tests: happy path + event, duplicate hash (also from another wallet), zero hash,
name/type limits (including the exact 128-byte UTF-8 boundary), and signer-pays-rent.

## Deploy to devnet

```bash
solana config set --url devnet
solana airdrop 2            # or https://faucet.solana.com
anchor deploy --provider.cluster devnet
```

The program ID above requires `target/deploy/niara_register_solana-keypair.json`
(kept out of git). Deploying with a new keypair: run `anchor keys sync`, rebuild,
and update `ID_PROGRAMA_SOLANA` in the Niara-Register site
(`lib/registro-solana.ts`).

## Web client

The Niara-Register site (`/signatures`) talks to this program without the Anchor
client: `lib/registro-solana.ts` encodes the instruction and decodes the account
by hand (discriminators from `target/idl/niara_register_solana.json`), and the
wallet (Phantom/Solflare) only signs — the transaction is sent through a devnet RPC.

## Known limitations

- Same as the EVM version: whoever lands the first transaction for a hash becomes
  its signer. A commit–reveal or multi-signer record (one PDA per
  `[hash, signer]`) is on the roadmap for contracts with several parties.
- Devnet only for now (mainnet after an external audit).

## Development history (disclosure)

The EVM contract this program ports, the Niara-Register site and its Sepolia
indexer were built in September 2026. This Solana program and the site's Solana
integration were written in October 2026, during the Crypto World's Fair hackathon.
