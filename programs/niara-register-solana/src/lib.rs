//! Niara-Register na Solana — prova de existência e autoria de documentos.
//!
//! Port do `RegistroAssinaturas.sol` (Sepolia, niaragaed/niara-contracts-Register)
//! com a mesma semântica: hash SHA-256 + assinante + timestamp + metadados,
//! um registro por hash, imutável.
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

    /// Registra a prova de existência de um documento pelo hash SHA-256.
    /// O documento nunca é enviado: só o hash e um nome/tipo descritivos.
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
