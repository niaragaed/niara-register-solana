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
      "name": "acceptAmendment",
      "docs": [
        "The person in control accepts the pending amendment."
      ],
      "discriminator": [
        180,
        212,
        55,
        94,
        76,
        191,
        6,
        165
      ],
      "accounts": [
        {
          "name": "controller",
          "writable": true,
          "signer": true,
          "relations": [
            "record"
          ]
        },
        {
          "name": "record",
          "writable": true
        },
        {
          "name": "usedHash",
          "docs": [
            "`init` fails if the hash was used meanwhile."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  116,
                  114,
                  95,
                  104,
                  97,
                  115,
                  104
                ]
              },
              {
                "kind": "arg",
                "path": "expectedDocumentHash"
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
          "name": "expectedDocumentHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "cancelAmendment",
      "discriminator": [
        101,
        132,
        117,
        54,
        208,
        80,
        227,
        248
      ],
      "accounts": [
        {
          "name": "issuer",
          "signer": true,
          "relations": [
            "record"
          ]
        },
        {
          "name": "record",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "initializeConfig",
      "docs": [
        "Creates the receipt configuration. Program upgrade authority only."
      ],
      "discriminator": [
        208,
        127,
        21,
        1,
        194,
        190,
        196,
        70
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "program",
          "address": "9RPHqLouFjoUbPdcmA1GyHMeDoWvjZMuCyYFPBWLmTcR"
        },
        {
          "name": "programData"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "merkleTree",
          "type": "pubkey"
        },
        {
          "name": "coreCollection",
          "type": "pubkey"
        },
        {
          "name": "metadataBaseUrl",
          "type": "string"
        }
      ]
    },
    {
      "name": "issueRecord",
      "docs": [
        "Issues a transferable record and gives control to `holder`."
      ],
      "discriminator": [
        52,
        77,
        222,
        95,
        135,
        154,
        65,
        82
      ],
      "accounts": [
        {
          "name": "issuer",
          "writable": true,
          "signer": true
        },
        {
          "name": "record",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  116,
                  114
                ]
              },
              {
                "kind": "arg",
                "path": "documentHash"
              }
            ]
          }
        },
        {
          "name": "usedHash",
          "docs": [
            "`init` fails if this hash was ever used before (singularity)."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  116,
                  114,
                  95,
                  104,
                  97,
                  115,
                  104
                ]
              },
              {
                "kind": "arg",
                "path": "documentHash"
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
          "name": "documentHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "metadataCommitment",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "holder",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "proposeAmendment",
      "docs": [
        "The issuer proposes a new version of the document."
      ],
      "discriminator": [
        237,
        97,
        111,
        166,
        137,
        200,
        30,
        39
      ],
      "accounts": [
        {
          "name": "issuer",
          "signer": true,
          "relations": [
            "record"
          ]
        },
        {
          "name": "record",
          "writable": true
        },
        {
          "name": "newHashMarker",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  116,
                  114,
                  95,
                  104,
                  97,
                  115,
                  104
                ]
              },
              {
                "kind": "arg",
                "path": "newDocumentHash"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "newDocumentHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "newMetadataCommitment",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "registerV2",
      "docs": [
        "Registers a document fingerprint and mints a soulbound cNFT receipt",
        "to the signer. The document name never goes on-chain; the type goes",
        "as a public code from a fixed list."
      ],
      "discriminator": [
        225,
        250,
        193,
        26,
        37,
        179,
        205,
        76
      ],
      "accounts": [
        {
          "name": "signer",
          "docs": [
            "Signs, pays the record rent and the Bubblegum mint fee, and receives",
            "the receipt. No Niara custody in between."
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "config",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "record",
          "docs": [
            "`init` fails if the PDA already exists: one record per hash, forever."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  99,
                  111,
                  114,
                  100,
                  95,
                  118,
                  50
                ]
              },
              {
                "kind": "arg",
                "path": "recordHash"
              }
            ]
          }
        },
        {
          "name": "legacyRecord",
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
                "path": "recordHash"
              }
            ]
          }
        },
        {
          "name": "receiptAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  99,
                  101,
                  105,
                  112,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "treeConfig",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "merkleTree"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                152,
                139,
                128,
                235,
                121,
                53,
                40,
                105,
                178,
                36,
                116,
                95,
                89,
                221,
                191,
                138,
                38,
                88,
                202,
                19,
                220,
                104,
                129,
                33,
                38,
                53,
                28,
                174,
                7,
                193,
                165,
                165
              ]
            }
          }
        },
        {
          "name": "merkleTree",
          "writable": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "coreCollection",
          "writable": true,
          "relations": [
            "config"
          ]
        },
        {
          "name": "mplCoreCpiSigner",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  112,
                  108,
                  95,
                  99,
                  111,
                  114,
                  101,
                  95,
                  99,
                  112,
                  105,
                  95,
                  115,
                  105,
                  103,
                  110,
                  101,
                  114
                ]
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                152,
                139,
                128,
                235,
                121,
                53,
                40,
                105,
                178,
                36,
                116,
                95,
                89,
                221,
                191,
                138,
                38,
                88,
                202,
                19,
                220,
                104,
                129,
                33,
                38,
                53,
                28,
                174,
                7,
                193,
                165,
                165
              ]
            }
          }
        },
        {
          "name": "logWrapper",
          "address": "mnoopTCrg4p8ry25e4bcWA9XZjbNjMTfgYVGGEdRsf3"
        },
        {
          "name": "compressionProgram",
          "address": "mcmt6YrQEMKw8Mw43FmpRLmf7BqRnFMKmAcbxE3xkAW"
        },
        {
          "name": "mplCoreProgram",
          "address": "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
        },
        {
          "name": "bubblegumProgram",
          "address": "BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "recordHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "scheme",
          "type": "u8"
        },
        {
          "name": "documentType",
          "type": "u16"
        },
        {
          "name": "metadataCommitment",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    },
    {
      "name": "surrender",
      "docs": [
        "The person in control surrenders the record to the issuer."
      ],
      "discriminator": [
        156,
        0,
        23,
        44,
        81,
        56,
        119,
        164
      ],
      "accounts": [
        {
          "name": "controller",
          "signer": true,
          "relations": [
            "record"
          ]
        },
        {
          "name": "record",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "terminate",
      "docs": [
        "The issuer ends a surrendered record (0 fulfilled, 1 replaced by paper, 2 other)."
      ],
      "discriminator": [
        40,
        31,
        99,
        52,
        83,
        243,
        37,
        201
      ],
      "accounts": [
        {
          "name": "issuer",
          "signer": true,
          "relations": [
            "record"
          ]
        },
        {
          "name": "record",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "reason",
          "type": "u8"
        }
      ]
    },
    {
      "name": "transferControl",
      "docs": [
        "The person in control passes control to someone else."
      ],
      "discriminator": [
        203,
        120,
        44,
        119,
        23,
        27,
        11,
        129
      ],
      "accounts": [
        {
          "name": "controller",
          "signer": true,
          "relations": [
            "record"
          ]
        },
        {
          "name": "record",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "newController",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "updateConfig",
      "docs": [
        "Points new receipts at another tree, collection or metadata URL. Only the",
        "program's current upgrade authority (e.g. the Squads vault) can call it."
      ],
      "discriminator": [
        29,
        158,
        252,
        191,
        10,
        83,
        219,
        99
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true
        },
        {
          "name": "config",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  110,
                  102,
                  105,
                  103
                ]
              }
            ]
          }
        },
        {
          "name": "program",
          "address": "9RPHqLouFjoUbPdcmA1GyHMeDoWvjZMuCyYFPBWLmTcR"
        },
        {
          "name": "programData"
        }
      ],
      "args": [
        {
          "name": "merkleTree",
          "type": "pubkey"
        },
        {
          "name": "coreCollection",
          "type": "pubkey"
        },
        {
          "name": "metadataBaseUrl",
          "type": "string"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "config",
      "discriminator": [
        155,
        12,
        170,
        224,
        30,
        250,
        204,
        130
      ]
    },
    {
      "name": "recordV2",
      "discriminator": [
        255,
        235,
        84,
        155,
        197,
        94,
        92,
        26
      ]
    },
    {
      "name": "transferableRecord",
      "discriminator": [
        94,
        249,
        212,
        84,
        203,
        21,
        95,
        64
      ]
    },
    {
      "name": "usedHash",
      "discriminator": [
        210,
        146,
        208,
        32,
        76,
        150,
        180,
        169
      ]
    }
  ],
  "events": [
    {
      "name": "amendmentCancelled",
      "discriminator": [
        174,
        89,
        251,
        235,
        7,
        164,
        162,
        94
      ]
    },
    {
      "name": "amendmentProposed",
      "discriminator": [
        240,
        0,
        141,
        249,
        56,
        195,
        144,
        207
      ]
    },
    {
      "name": "controlTransferred",
      "discriminator": [
        107,
        178,
        53,
        201,
        22,
        6,
        115,
        185
      ]
    },
    {
      "name": "documentRegisteredV2",
      "discriminator": [
        23,
        150,
        17,
        90,
        254,
        203,
        21,
        8
      ]
    },
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
    },
    {
      "name": "recordAmended",
      "discriminator": [
        185,
        221,
        124,
        101,
        21,
        90,
        240,
        77
      ]
    },
    {
      "name": "recordIssued",
      "discriminator": [
        44,
        242,
        204,
        114,
        101,
        237,
        254,
        224
      ]
    },
    {
      "name": "recordSurrendered",
      "discriminator": [
        214,
        82,
        17,
        89,
        13,
        179,
        143,
        243
      ]
    },
    {
      "name": "recordTerminated",
      "discriminator": [
        232,
        108,
        26,
        67,
        156,
        123,
        136,
        73
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
    },
    {
      "code": 6003,
      "name": "unknownScheme",
      "msg": "Unknown hash scheme"
    },
    {
      "code": 6004,
      "name": "alreadyRegisteredV1",
      "msg": "This hash already has a v1 record"
    },
    {
      "code": 6005,
      "name": "notUpgradeAuthority",
      "msg": "Only the program upgrade authority can do this"
    },
    {
      "code": 6006,
      "name": "invalidBaseUrl",
      "msg": "Metadata base URL is empty or too long"
    },
    {
      "code": 6007,
      "name": "configMismatch",
      "msg": "Account does not match the configured one"
    },
    {
      "code": 6008,
      "name": "invalidTreeConfig",
      "msg": "Could not read the tree config"
    },
    {
      "code": 6009,
      "name": "invalidHolder",
      "msg": "Invalid holder"
    },
    {
      "code": 6010,
      "name": "notIssuer",
      "msg": "Only the issuer can do this"
    },
    {
      "code": 6011,
      "name": "notController",
      "msg": "Only the person in control can do this"
    },
    {
      "code": 6012,
      "name": "notActive",
      "msg": "The record is not active"
    },
    {
      "code": 6013,
      "name": "notSurrendered",
      "msg": "The record has not been surrendered"
    },
    {
      "code": 6014,
      "name": "noPendingAmendment",
      "msg": "There is no pending amendment"
    },
    {
      "code": 6015,
      "name": "amendmentMismatch",
      "msg": "The pending amendment does not match"
    },
    {
      "code": 6016,
      "name": "hashAlreadyUsed",
      "msg": "This document hash was already used"
    },
    {
      "code": 6017,
      "name": "unknownTerminationReason",
      "msg": "Unknown termination reason"
    },
    {
      "code": 6018,
      "name": "invalidDocumentType",
      "msg": "Document type must not be 0"
    }
  ],
  "types": [
    {
      "name": "amendmentCancelled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "record",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "amendmentProposed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "record",
            "type": "pubkey"
          },
          {
            "name": "newDocumentHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "newMetadataCommitment",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "config",
      "docs": [
        "Receipt infrastructure. Set by the program upgrade authority."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "docs": [
              "Who last set the config: the upgrade authority at that time (informative;",
              "update_config checks the program's current upgrade authority)."
            ],
            "type": "pubkey"
          },
          {
            "name": "merkleTree",
            "docs": [
              "Bubblegum V2 tree whose delegate is the receipt authority PDA."
            ],
            "type": "pubkey"
          },
          {
            "name": "coreCollection",
            "docs": [
              "MPL-Core collection: update authority = receipt authority PDA, with the",
              "BubblegumV2 plugin and PermanentFreezeDelegate { frozen: true }, which",
              "makes every receipt in it non-transferable from the moment it is minted."
            ],
            "type": "pubkey"
          },
          {
            "name": "metadataBaseUrl",
            "docs": [
              "Receipt metadata URI prefix, e.g. https://niara-register.vercel.app/api/receipts/solana/"
            ],
            "type": "string"
          },
          {
            "name": "receiptAuthorityBump",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "controlTransferred",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "record",
            "type": "pubkey"
          },
          {
            "name": "from",
            "type": "pubkey"
          },
          {
            "name": "to",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "documentRegisteredV2",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "recordHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "signer",
            "type": "pubkey"
          },
          {
            "name": "scheme",
            "type": "u8"
          },
          {
            "name": "documentType",
            "type": "u16"
          },
          {
            "name": "metadataCommitment",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "timestamp",
            "type": "i64"
          },
          {
            "name": "slot",
            "type": "u64"
          },
          {
            "name": "receiptAssetId",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "documentoRegistrado",
      "docs": [
        "v1 event, kept in the IDL so past transactions stay decodable. No longer emitted."
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
    },
    {
      "name": "recordAmended",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "record",
            "type": "pubkey"
          },
          {
            "name": "version",
            "type": "u32"
          },
          {
            "name": "documentHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "metadataCommitment",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "recordIssued",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "record",
            "type": "pubkey"
          },
          {
            "name": "issuer",
            "type": "pubkey"
          },
          {
            "name": "holder",
            "type": "pubkey"
          },
          {
            "name": "documentHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "metadataCommitment",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "recordSurrendered",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "record",
            "type": "pubkey"
          },
          {
            "name": "by",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "recordTerminated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "record",
            "type": "pubkey"
          },
          {
            "name": "reason",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "recordV2",
      "docs": [
        "Privacy-preserving proof of existence. No readable metadata."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "signer",
            "type": "pubkey"
          },
          {
            "name": "recordHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "scheme",
            "type": "u8"
          },
          {
            "name": "documentType",
            "docs": [
              "Public document type code from a fixed list (never free text); 0 is invalid.",
              "Same codes as SignatureRegistryV2.sol (1 contract … 11 other)."
            ],
            "type": "u16"
          },
          {
            "name": "metadataCommitment",
            "docs": [
              "SHA-256(\"niara-meta-v1\" || salt || metadata JSON), or all zeros."
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
            "type": "i64"
          },
          {
            "name": "slot",
            "type": "u64"
          },
          {
            "name": "receiptAssetId",
            "docs": [
              "Compressed NFT receipt minted to `signer` in the same transaction."
            ],
            "type": "pubkey"
          },
          {
            "name": "receiptTree",
            "type": "pubkey"
          },
          {
            "name": "receiptNonce",
            "type": "u64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "transferableRecord",
      "docs": [
        "An electronic transferable record. `controller` is the person in control;",
        "only that key can pass control on."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "issuer",
            "type": "pubkey"
          },
          {
            "name": "controller",
            "type": "pubkey"
          },
          {
            "name": "originalHash",
            "docs": [
              "Hash of the original document; also the PDA seed."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "documentHash",
            "docs": [
              "Hash of the current version."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "metadataCommitment",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "version",
            "type": "u32"
          },
          {
            "name": "status",
            "type": "u8"
          },
          {
            "name": "issuedAt",
            "type": "i64"
          },
          {
            "name": "pendingHash",
            "docs": [
              "All zeros when there is no pending amendment."
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "pendingMetadataCommitment",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "usedHash",
      "docs": [
        "Exists for every document hash ever used by a transferable record, so no",
        "hash can be issued or amended into twice."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "assinaturaSeed",
      "docs": [
        "PDA seed of each v1 record: [\"assinatura\", hash_sha256].",
        "Because the PDA address is derived from the hash itself, there is at most",
        "ONE account per document. That is what guarantees a single record per hash",
        "(parity with `DocumentoJaRegistrado` in RegistroAssinaturas.sol).",
        "v1 is read-only now: the instruction that wrote it was removed because it",
        "stored the document name and type in plain text."
      ],
      "type": "bytes",
      "value": "[97, 115, 115, 105, 110, 97, 116, 117, 114, 97]"
    },
    {
      "name": "configSeed",
      "docs": [
        "Singleton configuration: [\"config\"]."
      ],
      "type": "bytes",
      "value": "[99, 111, 110, 102, 105, 103]"
    },
    {
      "name": "etrHashSeed",
      "docs": [
        "Marker for every document hash ever used by a transferable record,",
        "original or amended: [\"etr_hash\", document_hash]."
      ],
      "type": "bytes",
      "value": "[101, 116, 114, 95, 104, 97, 115, 104]"
    },
    {
      "name": "etrSeed",
      "docs": [
        "Transferable record: [\"etr\", original_document_hash]."
      ],
      "type": "bytes",
      "value": "[101, 116, 114]"
    },
    {
      "name": "receiptAuthoritySeed",
      "docs": [
        "PDA that is the tree delegate, the collection update authority and the",
        "collection's permanent freeze delegate: [\"receipt_authority\"]."
      ],
      "type": "bytes",
      "value": "[114, 101, 99, 101, 105, 112, 116, 95, 97, 117, 116, 104, 111, 114, 105, 116, 121]"
    },
    {
      "name": "recordV2Seed",
      "docs": [
        "v2 record: [\"record_v2\", record_hash]."
      ],
      "type": "bytes",
      "value": "[114, 101, 99, 111, 114, 100, 95, 118, 50]"
    },
    {
      "name": "schemeSaltedSha256",
      "docs": [
        "1 = SHA-256(\"niara-record-v1\" || salt || SHA-256(file))."
      ],
      "type": "u8",
      "value": "1"
    },
    {
      "name": "schemeSignedPdfSha256",
      "docs": [
        "How the record hash was computed. Must match the site's lib/commitments.ts",
        "and SignatureRegistryV2.sol.",
        "0 = SHA-256 of the final PAdES-signed PDF."
      ],
      "type": "u8",
      "value": "0"
    }
  ]
};
