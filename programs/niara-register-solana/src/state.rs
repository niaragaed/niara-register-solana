use anchor_lang::prelude::*;

use crate::constants::*;

// ---------------------------------------------------------------------------
// v1 (read-only)
// ---------------------------------------------------------------------------

/// v1 proof of existence. Kept so existing accounts stay decodable; no
/// instruction writes it anymore because it stored the document name and
/// type in plain text.
#[account]
#[derive(InitSpace)]
pub struct Assinatura {
    pub assinante: Pubkey,
    pub hash_documento: [u8; 32],
    pub timestamp: i64,
    pub slot: u64,
    #[max_len(MAX_NOME_DOCUMENTO)]
    pub nome_documento: String,
    #[max_len(MAX_TIPO_DOCUMENTO)]
    pub tipo_documento: String,
    pub bump: u8,
}

/// v1 event, kept in the IDL so past transactions stay decodable. No longer emitted.
#[event]
pub struct DocumentoRegistrado {
    pub hash_documento: [u8; 32],
    pub assinante: Pubkey,
    pub nome_documento: String,
    pub tipo_documento: String,
    pub timestamp: i64,
    pub slot: u64,
}

// ---------------------------------------------------------------------------
// v2
// ---------------------------------------------------------------------------

/// Receipt infrastructure. Set by the program upgrade authority.
#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    /// Bubblegum V2 tree whose delegate is the receipt authority PDA.
    pub merkle_tree: Pubkey,
    /// MPL-Core collection: update authority = receipt authority PDA, with the
    /// BubblegumV2 plugin and PermanentFreezeDelegate { frozen: true }, which
    /// makes every receipt in it non-transferable from the moment it is minted.
    pub core_collection: Pubkey,
    /// Receipt metadata URI prefix, e.g. https://niara-register.vercel.app/api/receipts/solana/
    #[max_len(MAX_METADATA_BASE_URL)]
    pub metadata_base_url: String,
    pub receipt_authority_bump: u8,
    pub bump: u8,
}

/// Privacy-preserving proof of existence. No readable metadata.
#[account]
#[derive(InitSpace)]
pub struct RecordV2 {
    pub signer: Pubkey,
    pub record_hash: [u8; 32],
    pub scheme: u8,
    /// Public document type code from a fixed list (never free text); 0 is invalid.
    /// Same codes as SignatureRegistryV2.sol (1 contract … 11 other).
    pub document_type: u16,
    /// SHA-256("niara-meta-v1" || salt || metadata JSON), or all zeros.
    pub metadata_commitment: [u8; 32],
    pub timestamp: i64,
    pub slot: u64,
    /// Compressed NFT receipt minted to `signer` in the same transaction.
    pub receipt_asset_id: Pubkey,
    pub receipt_tree: Pubkey,
    pub receipt_nonce: u64,
    pub bump: u8,
}

#[event]
pub struct DocumentRegisteredV2 {
    pub record_hash: [u8; 32],
    pub signer: Pubkey,
    pub scheme: u8,
    pub document_type: u16,
    pub metadata_commitment: [u8; 32],
    pub timestamp: i64,
    pub slot: u64,
    pub receipt_asset_id: Pubkey,
}

// ---------------------------------------------------------------------------
// Transferable records (MLETR-aligned)
// ---------------------------------------------------------------------------

pub const ETR_STATUS_ACTIVE: u8 = 1;
pub const ETR_STATUS_SURRENDERED: u8 = 2;
pub const ETR_STATUS_TERMINATED: u8 = 3;

pub const ETR_REASON_FULFILLED: u8 = 0;
pub const ETR_REASON_REPLACED_BY_PAPER: u8 = 1;
pub const ETR_REASON_OTHER: u8 = 2;

/// An electronic transferable record. `controller` is the person in control;
/// only that key can pass control on.
#[account]
#[derive(InitSpace)]
pub struct TransferableRecord {
    pub issuer: Pubkey,
    pub controller: Pubkey,
    /// Hash of the original document; also the PDA seed.
    pub original_hash: [u8; 32],
    /// Hash of the current version.
    pub document_hash: [u8; 32],
    pub metadata_commitment: [u8; 32],
    pub version: u32,
    pub status: u8,
    pub issued_at: i64,
    /// All zeros when there is no pending amendment.
    pub pending_hash: [u8; 32],
    pub pending_metadata_commitment: [u8; 32],
    pub bump: u8,
}

/// Exists for every document hash ever used by a transferable record, so no
/// hash can be issued or amended into twice.
#[account]
#[derive(InitSpace)]
pub struct UsedHash {
    pub bump: u8,
}

#[event]
pub struct RecordIssued {
    pub record: Pubkey,
    pub issuer: Pubkey,
    pub holder: Pubkey,
    pub document_hash: [u8; 32],
    pub metadata_commitment: [u8; 32],
}

#[event]
pub struct ControlTransferred {
    pub record: Pubkey,
    pub from: Pubkey,
    pub to: Pubkey,
}

#[event]
pub struct AmendmentProposed {
    pub record: Pubkey,
    pub new_document_hash: [u8; 32],
    pub new_metadata_commitment: [u8; 32],
}

#[event]
pub struct AmendmentCancelled {
    pub record: Pubkey,
}

#[event]
pub struct RecordAmended {
    pub record: Pubkey,
    pub version: u32,
    pub document_hash: [u8; 32],
    pub metadata_commitment: [u8; 32],
}

#[event]
pub struct RecordSurrendered {
    pub record: Pubkey,
    pub by: Pubkey,
}

#[event]
pub struct RecordTerminated {
    pub record: Pubkey,
    pub reason: u8,
}
