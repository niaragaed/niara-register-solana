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

Tests: `bash scripts/fetch-fixtures.sh` once, then `anchor build --ignore-keys && bash scripts/test-local.sh` (local validator with the Metaplex programs and Squads v4 loaded).

## v3: commit-reveal and ORB attestation (needs another program upgrade)

`register_v2` registered in one transaction, so whoever saw it pending could send the same hash
first (Solana has no public mempool like Ethereum, but leaders and relays do see transactions).
v3 replaces it:

1. **`commit(commitment)`** with `commitment = SHA-256("niara-commit-v1" ‖ program_id ‖ signer ‖
   record_hash ‖ nonce)` creates the PDA `["commitment", signer, commitment]`. It says nothing
   about the document. `cancel_commitment` closes a pending one (rent back).
2. **`register_v3(record_hash, scheme, document_type, metadata_commitment, nonce, orb_report_hash)`**
   in a **later slot** and within 24 h. The handler recomputes the commitment and checks that the
   account passed is the signer's own PDA for it, then closes it. A copy of the transaction sent by
   someone else has no such account. Same receipt as v2; the record goes to
   `["record_v3", hash]` (`RecordV3` = v2 fields + `orb_report_hash`), and a hash with a v1 or v2
   record is refused.

**ORB attestation.** A non-zero `orb_report_hash` is accepted only if the instruction right
before `register_v3` is a Solana Ed25519-program instruction in which the ORB attester key signs
`SHA-256("niara-orb-v1" ‖ program_id ‖ record_hash ‖ report_hash ‖ signer)` (a digest, so the
whole transaction still fits in 1232 bytes). The attester lives in `["orb_config"]`
(`initialize_orb_config`, upgrade authority only); `set_orb_attester` can be called by the
current attester (key rotation) or the upgrade authority. Without the config, ORB is off.

`register_v2` is removed by this upgrade: the site must switch to v3 in the same release
(`NEXT_PUBLIC_SOLANA_REGISTER_V3=1` in Niara-Register). Old `RecordV2` accounts stay readable
(the site and the indexer decode them by hand; the `RecordV2` type is no longer in the IDL because
no instruction uses it).

Upgrade steps (upgrade authority wallet; through Squads once the hand-over is done):

```bash
anchor build                                  # or cargo-build-sbf, see "Run the tests"
solana program deploy -u devnet target/deploy/niara_register_solana.so \
  --program-id 9RPHqLouFjoUbPdcmA1GyHMeDoWvjZMuCyYFPBWLmTcR
# then, only when an ORB attester key exists: initialize_orb_config(<attester pubkey>)
```

## Live on Solana devnet

- Program: [`9RPHqLouFjoUbPdcmA1GyHMeDoWvjZMuCyYFPBWLmTcR`](https://explorer.solana.com/address/9RPHqLouFjoUbPdcmA1GyHMeDoWvjZMuCyYFPBWLmTcR?cluster=devnet)
  — deployed at slot 509235352, upgrade authority held by the Niara deployer wallet, moving to a
  Squads multisig (2 of 3 Ledgers, time lock): see [docs/admin-keys.md](docs/admin-keys.md)
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

34 tests: receipt infrastructure (frozen collection held by the program PDA,
config changes only by the current upgrade authority), `register_v3` (no readable metadata, the receipt leaf
rebuilt and matched against the on-chain tree root, transfer refused even for
the owner, duplicate/zero/unknown-scheme/foreign-tree rejection; commit-reveal:
no commitment, same slot, wrong nonce, another hash's commitment, a front-runner
copying the reveal or passing the victim's commitment, close and cancel; ORB:
off without config, valid attestation, missing/foreign key/other signer/other
record/other report refused, attester rotation), the full
transferable-record life-cycle, and a rehearsal of the Squads multisig admin
(`tests/squads.ts`, with the real Squads v4 program: hand-over, upgrade and
config change only after 2 approvals and the time lock).

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

- Commit-reveal (v3) stops copying a pending registration. It does not stop
  someone who already holds the document hash (e.g. the other party of a
  contract) from committing and registering it first with their own key: the
  record says who registered it, and for a PAdES PDF who signed it is inside
  the PDF. A multi-signer record (one PDA per `[hash, signer]`) is on the
  roadmap for contracts with several parties.
- `cargo-build-sbf` 3.0.x ships platform-tools v1.51 (Rust 1.84), too old for
  some current dependencies (edition 2024); build with platform-tools v1.52.
- Devnet only for now. Mainnet comes after an external audit.

## Development history (disclosure)

The EVM contract this program ports, the Niara-Register site and its Sepolia
indexer were built in September 2026. Everything else was written in October
2026, during the Crypto World's Fair hackathon: this Solana program, the site's
Solana integration, the multichain ledger and indexers, and the EVM deployments
on Base, Robinhood Chain, HyperEVM and Tempo.
