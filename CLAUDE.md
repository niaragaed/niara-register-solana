# niara-register-solana

## Language

English is the default for everything in this repository: code, identifiers,
comments, docs, test names, scripts and commit messages.

Exception: names that are part of the deployed program's interface stay as they
are: the `Assinatura` account and its fields, the `DocumentoRegistrado` event,
the first three `ErrorCode` variants and their messages, and the PDA seed
`"assinatura"`. Renaming any of them changes discriminators, seeds or error
codes of the program live on devnet (`9RPHqLouFjoUbPdcmA1GyHMeDoWvjZMuCyYFPBWLmTcR`).
New `ErrorCode` variants go at the end so existing codes do not move.

## Program layout

- v1 (`registrar`) was **removed**: it wrote the document name and type in
  plain text. v1 accounts stay on-chain and readable (decoded by hand in the
  site and the indexer), and `register_v2` refuses a hash that has a v1 record.
- `register_v2` stores only the record hash, the hash scheme, a public
  document type code (fixed list, never free text) and a salted metadata commitment, and mints a soulbound cNFT receipt (Bubblegum v2) to the
  signer in the same transaction. The collection is MPL-Core with
  `PermanentFreezeDelegate { frozen: true }` held by the `receipt_authority`
  PDA, so every receipt is non-transferable from the moment it is minted. The
  hash recipes must stay byte-identical to `SignatureRegistryV2.sol` and to
  `lib/commitments.ts` in Niara-Register.
- `initialize_config` / `update_config` set the tree, collection and receipt
  metadata URL; only the program's *current* upgrade authority can call them.
  One-time setup: `scripts/setup-receipts.ts`. The upgrade authority moves to a
  Squads v4 multisig (`scripts/squads/`, runbook in `docs/admin-keys.md`):
  never hand it to a single key again.
- Transferable records (`issue_record` … `terminate`) are designed to line up
  with MLETR. Describe them as "aligned with MLETR", never as "compliant":
  Brazil has not enacted MLETR.

Tests: `bash scripts/fetch-fixtures.sh` once, then
`anchor build --ignore-keys && bash scripts/test-local.sh`.

If you change `///` doc comments in `programs/`, regenerate the IDL
(`anchor build`) and copy `target/idl` and `target/types` into `idl/`.

## No AI attribution (hard rule)

Nothing in this repository credits an AI tool, anywhere:

- no `Co-Authored-By: Claude` or `Claude-Session:` trailers, and no "Generated with Claude Code"
  line, in commit messages;
- no AI tool as a commit author or committer: commits use the project identity
  (`git config user.name`/`user.email` = `Niara <niaragaed@gmail.com>`, set in every clone and
  environment before the first commit — some environments default to `Claude <noreply@anthropic.com>`);
- no "Generated with/by Claude Code" footer in pull request descriptions, comments, issues or files.

It's enforced in two layers: the versioned `.claude/settings.json` turns Claude Code's commit
and PR attribution off (`"attribution": {"commit": "", "pr": ""}`), and the `No AI attribution`
GitHub Actions check (`.github/workflows/no-ai-attribution.yml`) fails on any commit or pull
request description that carries it. Some hosted environments append a footer to PR
descriptions by themselves; if the check flags one, delete that line in the GitHub UI. The rule
applies to every Niara repository, including new ones: copy both files when creating a repo.

