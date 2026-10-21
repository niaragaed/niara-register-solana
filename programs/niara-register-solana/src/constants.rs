use anchor_lang::prelude::*;

/// PDA seed of each v1 record: ["assinatura", hash_sha256].
/// Because the PDA address is derived from the hash itself, there is at most
/// ONE account per document. That is what guarantees a single record per hash
/// (parity with `DocumentoJaRegistrado` in RegistroAssinaturas.sol).
/// v1 is read-only now: the instruction that wrote it was removed because it
/// stored the document name and type in plain text.
#[constant]
pub const ASSINATURA_SEED: &[u8] = b"assinatura";

/// v1 limits in BYTES (UTF-8). Kept so existing v1 accounts keep their layout.
pub const MAX_NOME_DOCUMENTO: usize = 128;

pub const MAX_TIPO_DOCUMENTO: usize = 32;

// ---------------------------------------------------------------------------
// v2: receipts and privacy-preserving records
// ---------------------------------------------------------------------------

/// Singleton configuration: ["config"].
#[constant]
pub const CONFIG_SEED: &[u8] = b"config";

/// PDA that is the tree delegate, the collection update authority and the
/// collection's permanent freeze delegate: ["receipt_authority"].
#[constant]
pub const RECEIPT_AUTHORITY_SEED: &[u8] = b"receipt_authority";

/// v2 record: ["record_v2", record_hash].
#[constant]
pub const RECORD_V2_SEED: &[u8] = b"record_v2";

/// How the record hash was computed. Must match the site's lib/commitments.ts
/// and SignatureRegistryV2.sol.
/// 0 = SHA-256 of the final PAdES-signed PDF.
#[constant]
pub const SCHEME_SIGNED_PDF_SHA256: u8 = 0;
/// 1 = SHA-256("niara-record-v1" || salt || SHA-256(file)).
#[constant]
pub const SCHEME_SALTED_SHA256: u8 = 1;

/// Receipt metadata URI = metadata_base_url + 64 hex digits; the Metaplex
/// limit for the URI is 200 bytes.
pub const MAX_METADATA_BASE_URL: usize = 136;

pub const RECEIPT_NAME: &str = "Niara Register receipt";
pub const RECEIPT_SYMBOL: &str = "NIARA-R";

// ---------------------------------------------------------------------------
// Transferable records (MLETR-aligned)
// ---------------------------------------------------------------------------

/// Transferable record: ["etr", original_document_hash].
#[constant]
pub const ETR_SEED: &[u8] = b"etr";

/// Marker for every document hash ever used by a transferable record,
/// original or amended: ["etr_hash", document_hash].
#[constant]
pub const ETR_HASH_SEED: &[u8] = b"etr_hash";

// ---------------------------------------------------------------------------
// External programs
// ---------------------------------------------------------------------------

pub const MPL_NOOP_ID: Pubkey = pubkey!("mnoopTCrg4p8ry25e4bcWA9XZjbNjMTfgYVGGEdRsf3");
pub const MPL_ACCOUNT_COMPRESSION_ID: Pubkey =
    pubkey!("mcmt6YrQEMKw8Mw43FmpRLmf7BqRnFMKmAcbxE3xkAW");
pub const MPL_CORE_ID: Pubkey = pubkey!("CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d");
pub const MPL_BUBBLEGUM_ID: Pubkey = pubkey!("BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY");
pub const MPL_CORE_CPI_SIGNER_SEED: &[u8] = b"mpl_core_cpi_signer";
