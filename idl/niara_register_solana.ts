/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/niara_register_solana.json`.
 */
export type NiaraRegisterSolana = {
  "address": "9RPHqLouFjoUbPdcmA1GyHMeDoWvjZMuCyYFPBWLmTcR",
  "metadata": {
    "name": "niaraRegisterSolana",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "registrar",
      "docs": [
        "Registers proof of existence of a document by its SHA-256 hash.",
        "The document itself is never sent: only the hash and a descriptive name/type."
      ],
      "discriminator": [
        52,
        163,
        233,
        194,
        164,
        203,
        200,
        64
      ],
      "accounts": [
        {
          "name": "assinante",
          "docs": [
            "The signer pays the rent for the record account, with no Niara",
            "custody in between."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "assinatura",
          "docs": [
            "`init` fails if the PDA already exists: a registered hash can never be",
            "overwritten or back-dated."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  115,
                  115,
                  105,
                  110,
                  97,
                  116,
                  117,
                  114,
                  97
                ]
              },
              {
                "kind": "arg",
                "path": "hashDocumento"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "hashDocumento",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "nomeDocumento",
          "type": "string"
        },
        {
          "name": "tipoDocumento",
          "type": "string"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "assinatura",
      "discriminator": [
        68,
        120,
        123,
        196,
        84,
        89,
        85,
        188
      ]
    }
  ],
  "events": [
    {
      "name": "documentoRegistrado",
      "discriminator": [
        206,
        226,
        126,
        15,
        74,
        52,
        33,
        1
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "hashInvalido",
      "msg": "Hash invalido: o hash SHA-256 nao pode ser todo zero"
    },
    {
      "code": 6001,
      "name": "nomeInvalido",
      "msg": "Nome do documento vazio ou acima do limite de bytes"
    },
    {
      "code": 6002,
      "name": "tipoInvalido",
      "msg": "Tipo do documento vazio ou acima do limite de bytes"
    }
  ],
  "types": [
    {
      "name": "assinatura",
      "docs": [
        "Proof of existence and authorship of a document. Stores only the SHA-256",
        "hash; the document itself never goes on-chain (\"your assets, truly yours\":",
        "the file stays with the customer).",
        "",
        "Complementary evidentiary record: it does NOT replace a notary or ICP-Brasil."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "assinante",
            "docs": [
              "Self-custody wallet that signed the registration transaction."
            ],
            "type": "pubkey"
          },
          {
            "name": "hashDocumento",
            "docs": [
              "SHA-256 hash of the document, computed in the customer's browser."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "timestamp",
            "docs": [
              "Cluster Unix timestamp at registration time."
            ],
            "type": "i64"
          },
          {
            "name": "slot",
            "docs": [
              "Slot in which the record landed: an extra anchor for time ordering."
            ],
            "type": "u64"
          },
          {
            "name": "nomeDocumento",
            "type": "string"
          },
          {
            "name": "tipoDocumento",
            "type": "string"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "documentoRegistrado",
      "docs": [
        "Same logical shape as the EVM contract's `DocumentoRegistrado` event, so the",
        "Niara Register indexer can handle both networks with the same schema."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "hashDocumento",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "assinante",
            "type": "pubkey"
          },
          {
            "name": "nomeDocumento",
            "type": "string"
          },
          {
            "name": "tipoDocumento",
            "type": "string"
          },
          {
            "name": "timestamp",
            "type": "i64"
          },
          {
            "name": "slot",
            "type": "u64"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "assinaturaSeed",
      "docs": [
        "PDA seed of each record: [\"assinatura\", hash_sha256].",
        "Because the PDA address is derived from the hash itself, there is at most",
        "ONE account per document. That is what guarantees a single record per hash",
        "(parity with `DocumentoJaRegistrado` in RegistroAssinaturas.sol)."
      ],
      "type": "bytes",
      "value": "[97, 115, 115, 105, 110, 97, 116, 117, 114, 97]"
    }
  ]
};
