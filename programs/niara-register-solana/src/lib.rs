//! Niara Register on Solana: proof of existence and authorship for documents.
//!
//! Port of `RegistroAssinaturas.sol` (EVM, niaragaed/niara-contracts-Register)
//! with the same semantics: SHA-256 hash + signer + timestamp + metadata,
//! one immutable record per hash.
//!
//! Instruction, account, event, error and seed names stay in Portuguese
//! because they are part of the deployed program's interface (discriminators
//! and PDA seeds). Glossary: registrar = register, assinatura = signature,
//! assinante = signer, documento = document, nome = name, tipo = type.
pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("9RPHqLouFjoUbPdcmA1GyHMeDoWvjZMuCyYFPBWLmTcR");

#[program]
pub mod niara_register_solana {
    use super::*;

    /// Registers proof of existence of a document by its SHA-256 hash.
    /// The document itself is never sent: only the hash and a descriptive name/type.
    pub fn registrar(
        ctx: Context<Registrar>,
        hash_documento: [u8; 32],
        nome_documento: String,
        tipo_documento: String,
    ) -> Result<()> {
        crate::instructions::registrar::handle_registrar(
            ctx,
            hash_documento,
            nome_documento,
            tipo_documento,
        )
    }
}
