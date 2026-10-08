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
        "Registra a prova de existência de um documento pelo hash SHA-256.",
        "O documento nunca é enviado: só o hash e um nome/tipo descritivos."
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
            "Quem assina é quem paga o rent da conta de registro — sem custódia da",
            "Niara no meio."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "assinatura",
          "docs": [
            "`init` falha se o PDA já existir: um hash registrado nunca pode ser",
            "sobrescrito nem \"re-datado\"."
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
        "Prova de existência e autoria de um documento. Guarda só o hash SHA-256 —",
        "o documento em si nunca vai para a blockchain (princípio \"seu ativo, enfim",
        "seu\": o arquivo fica com o cliente).",
        "",
        "Registro probatório complementar: NÃO substitui cartório nem ICP-Brasil."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "assinante",
            "docs": [
              "Carteira (autocustódia) que assinou a transação de registro."
            ],
            "type": "pubkey"
          },
          {
            "name": "hashDocumento",
            "docs": [
              "Hash SHA-256 do documento, calculado no navegador do cliente."
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
              "Unix timestamp do cluster no momento do registro."
            ],
            "type": "i64"
          },
          {
            "name": "slot",
            "docs": [
              "Slot em que o registro entrou — âncora extra de ordenação temporal."
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
        "Mesmo formato lógico do evento `DocumentoRegistrado` do contrato EVM, para",
        "o indexer do Niara-Register tratar as duas redes com o mesmo schema."
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
        "Semente do PDA de cada registro: [\"assinatura\", hash_sha256].",
        "Como o endereço do PDA é derivado do próprio hash, existe no máximo UMA",
        "conta por documento — é isso que garante o \"registro único\" (paridade com",
        "o `DocumentoJaRegistrado` do RegistroAssinaturas.sol na Sepolia)."
      ],
      "type": "bytes",
      "value": "[97, 115, 115, 105, 110, 97, 116, 117, 114, 97]"
    }
  ]
};
