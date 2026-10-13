use anchor_lang::prelude::*;

use crate::constants::*;

/// Proof of existence and authorship of a document. Stores only the SHA-256
/// hash; the document itself never goes on-chain ("your assets, truly yours":
/// the file stays with the customer).
///
/// Complementary evidentiary record: it does NOT replace a notary or ICP-Brasil.
#[account]
#[derive(InitSpace)]
pub struct Assinatura {
    /// Self-custody wallet that signed the registration transaction.
    pub assinante: Pubkey,
    /// SHA-256 hash of the document, computed in the customer's browser.
    pub hash_documento: [u8; 32],
    /// Cluster Unix timestamp at registration time.
    pub timestamp: i64,
    /// Slot in which the record landed: an extra anchor for time ordering.
    pub slot: u64,
    #[max_len(MAX_NOME_DOCUMENTO)]
    pub nome_documento: String,
    #[max_len(MAX_TIPO_DOCUMENTO)]
    pub tipo_documento: String,
    pub bump: u8,
}

/// Same logical shape as the EVM contract's `DocumentoRegistrado` event, so the
/// Niara Register indexer can handle both networks with the same schema.
#[event]
pub struct DocumentoRegistrado {
    pub hash_documento: [u8; 32],
    pub assinante: Pubkey,
    pub nome_documento: String,
    pub tipo_documento: String,
    pub timestamp: i64,
    pub slot: u64,
}
