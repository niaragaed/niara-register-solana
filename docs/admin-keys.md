# Admin keys: inventory and the move to a multisig

Goal: no single key, computer or person can change what the Register does.
Every admin power sits behind a **Squads v4 multisig** whose voting keys live
on **Ledger** devices held by **different people**, with a **time lock**
between approval and execution so a bad change can be noticed and cancelled.

## Inventory (Register ecosystem)

| Key / account | What it can do | Today | Target |
|---|---|---|---|
| Solana program upgrade authority (`DGZfApdnkYLY2TGjrAsA4vB9FDgomf4arXogztgQmKt`) | Replace the program's code; call `update_config` (receipt tree, collection, metadata URL) | Hot keypair file (`niara-deployer.json`) on one computer | Squads vault (2 of 3 Ledgers, time lock) |
| `update_config` power | Point new receipts at another tree, collection or metadata URL | Followed whoever ran `initialize_config` | Follows the **current** upgrade authority (this change), so it moves with it |
| Bubblegum tree creator of the receipt tree (same deployer key) | `set_tree_delegate`: could let another key mint cNFTs into the receipt tree (not into the frozen collection, whose authority is the program's PDA) | Deployer key | Retire the deployer key after the move (see step 7). If it ever leaks before that: a new tree through an `update_config` vote |
| EVM contracts (`SignatureRegistryV2`, `TransferableRecordRegistry`) | Nothing: no owner, not upgradeable, no admin functions | — | — |
| EVM deployer `0x4369…35dc` | Deploy new contracts (no power over deployed ones) | Hot key | Hot key is acceptable; never reuse it as an owner/admin |
| W3C credential issuer key (`NIARA_VC_PRIVATE_JWK`) | Sign credentials as `did:web:niara-register.vercel.app` | Vercel env (Sensitive) + offline backup | Cloud KMS, see below. A multisig does not fit: it signs automatically on every request |
| GitHub, Vercel, Supabase, Railway, Reown, domain registrar | Change the site's code or hosting. Whoever controls the site controls `did:web` and what users are asked to sign (the Bybit 2025 attack came through a web interface) | Personal logins | Hardware security keys / passkeys as 2FA on every account; branch protection on `main`; no shared passwords; least privilege for collaborators |
| Supabase service-role key (Railway indexer) | Write to the public mirror | Railway env | Railway env; rotate if the Railway account is ever exposed |

## Multisig design

- **3 voting members, threshold 2.** Each voting key is a Ledger held by a
  different person (or one of them is a backup Ledger kept in another
  place, such as a safe-deposit box). Losing one Ledger does not lock the
  program; stealing one is not enough.
- **1 proposer key (`p` + `e`)**, a hot key on a computer: it can put a
  change up for vote and execute it once approved and past the time lock,
  but it can **never approve**. This keeps the Ledgers for decisions only.
- **Time lock:** devnet 1 hour (`3600`), mainnet 48 hours (`172800`).
  During that window members can cancel an approved proposal
  (`--action Cancel`, threshold votes).
- **No config authority:** adding or removing members, changing the
  threshold or the time lock also needs a vote (and waits the time lock).
- Squads v4 program: `SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf` (same id
  on devnet and mainnet).

The whole flow below is rehearsed on a local validator with the real Squads
program in `tests/squads.ts` (create, hand over the authority, the old key
loses `update_config`, upgrade only after 2 approvals and the time lock, a
non-voter cannot approve, config change through a vote).

## Runbook (devnet)

Tools: Solana CLI, this repo (`npm install`), and the Squads CLI for Ledger
votes: `cargo install squads-multisig-cli --version 0.1.7 --locked` (on
Linux/WSL first `sudo apt install libudev-dev pkg-config`, which the Ledger
USB support needs). A Ledger plugged into Windows is not visible inside WSL
without USB passthrough (usbipd-win); on Windows it is simpler to run the
Solana and Squads CLIs natively for the Ledger steps.

1. **Upgrade the program first, with the current key**, so `update_config`
   follows the upgrade authority before the authority moves:
   `solana program deploy target/deploy/niara_register_solana.so --program-id 9RPHqLouFjoUbPdcmA1GyHMeDoWvjZMuCyYFPBWLmTcR -u devnet`
2. **Each holder reads their Ledger address** (Solana app open on the
   device): `solana-keygen pubkey usb://ledger` and sends it to the others
   by a second channel (not only by e-mail).
3. **Create the multisig** (any funded key pays):
   ```bash
   PAYER=<payer.json> \
   MEMBERS="<LEDGER_A>:ve,<LEDGER_B>:v,<LEDGER_C>:v,<PROPOSER>:pe" \
   THRESHOLD=2 TIME_LOCK=3600 \
   npx ts-node scripts/squads/squads.ts create
   ```
   It writes `squads.devnet.json` (commit it: addresses only, no secrets).
4. **Every holder checks** `npx ts-node scripts/squads/squads.ts status`:
   their key is a member, threshold 2 of 3 voters, time lock 3600 s, config
   authority none. Note the **vault** address.
5. **Hand over the upgrade authority** (irreversible for the old key; a
   wrong address freezes the program for good, so compare the vault with
   step 4 character by character):
   ```bash
   solana program set-upgrade-authority 9RPHqLouFjoUbPdcmA1GyHMeDoWvjZMuCyYFPBWLmTcR \
     --new-upgrade-authority <VAULT> --skip-new-upgrade-authority-signer-check -u devnet
   ```
6. **Check** `status`: `upgrade auth. … = vault ✓`.
7. **Retire the deployer key**: move its SOL out, then delete
   `niara-deployer.json` from every machine and backup. It no longer
   controls the program, and deleting it also ends its power over the
   receipt tree's delegate.

### Upgrading afterwards

1. Build and publish the release `.so` and its SHA-256 (`sha256sum`).
2. Anyone writes it to a buffer and gives the buffer to the vault:
   `solana program write-buffer target/deploy/niara_register_solana.so -u devnet`
   `solana program set-buffer-authority <BUFFER> --new-buffer-authority <VAULT> -u devnet`
3. The proposer: `PAYER=<proposer.json> BUFFER=<BUFFER> SPILL=<refund address> npx ts-node scripts/squads/squads.ts propose-upgrade`
4. **Each voter checks the code before voting**:
   `BUFFER=<BUFFER> npx ts-node scripts/squads/squads.ts buffer-hash` must
   show the release size and SHA-256. Then votes with the Ledger:
   ```bash
   squads-multisig-cli proposal-vote --rpc-url https://api.devnet.solana.com \
     --keypair usb://ledger --multisig-pubkey <MULTISIG> --transaction-index <N> --action Approve
   ```
5. After the time lock: `PAYER=<proposer.json> INDEX=<N> npx ts-node scripts/squads/squads.ts execute`
   (or `squads-multisig-cli vault-transaction-execute … --keypair usb://ledger`).

Config changes are the same with `propose-config` (TREE / COLLECTION /
BASE_URL; anything not given keeps its current value).

### Mainnet

A new multisig with the 48-hour time lock, created only after the devnet one
has been used for at least one real upgrade and one config change. Add
`solana-verify` (verifiable builds) so anyone can match the deployed code to
a commit.

## Credential issuer key

The issuer key signs every credential on request, so it cannot wait for
votes. What protects it instead:

- **Cloud KMS** (AWS KMS or Google Cloud KMS) holding a non-exportable
  ES256 (P-256) key. The site asks KMS to sign; the private key never exists
  in Vercel, in the repo or on a laptop.
- **No static secret:** Vercel authenticates to the cloud with OIDC
  federation, scoped to the production deployment.
- **Two people for changes:** permissions to change the key policy or
  create a new key version need a second person (cloud IAM), and every use
  is logged.
- **Rotation:** a new key version gets a new `kid` in `did.json`; the old
  public key stays listed so earlier credentials still verify; a
  compromised key is removed from `did.json` and its credentials re-issued.
- With the ICP-Brasil e-CNPJ (`NIARA_VC_X5C`), the certificate must match
  the KMS key (the CSR is generated from the KMS key).

Until then: the key stays only in Vercel (Sensitive) and in the offline
backup, and the Vercel account has a hardware 2FA key.
