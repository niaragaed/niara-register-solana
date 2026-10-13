# niara-register-solana

## Language

English is the default for everything in this repository: code, identifiers,
comments, docs, test names, scripts and commit messages.

Exception: names that are part of the deployed program's interface stay as they
are. That covers the instruction `registrar`, the `Registrar` accounts struct,
the `Assinatura` account and its fields, the `DocumentoRegistrado` event, the
`ErrorCode` variants and their messages, and the PDA seed `"assinatura"`.
Renaming any of them changes discriminators, seeds or the IDL of the program
live on devnet (`9RPHqLouFjoUbPdcmA1GyHMeDoWvjZMuCyYFPBWLmTcR`). New programs
and instructions should use English names from the start.

If you change `///` doc comments in `programs/`, regenerate the IDL
(`anchor build`) or update `idl/` by hand so the docs stay in sync.
