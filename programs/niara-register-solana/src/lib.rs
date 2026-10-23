//! Niara Register on Solana: proof of existence and authorship for documents.
//!
//! v2 (`register_v2`) stores only the record hash, the hash scheme and a salted
//! metadata commitment, and mints a non-transferable compressed NFT receipt
//! (Bubblegum v2, into an MPL-Core collection frozen by a permanent freeze
//! delegate) to the signer in the same transaction. Same semantics as
//! `SignatureRegistryV2.sol` on the EVM networks.
//!
//! v1 (`registrar`) was removed because it wrote the document name and type
//! in plain text. Existing v1 accounts (`Assinatura`) stay on-chain and
//! readable, and a hash with a v1 record cannot be registered again in v2.
//!
//! The program also holds MLETR-aligned transferable records (see
//! `instructions/transferable.rs`).
//!
//! v1 names stay in Portuguese because they are part of the deployed
//! interface (account discriminator, PDA seed, error codes).
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

    /// Creates the receipt configuration. Program upgrade authority only.
    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        merkle_tree: Pubkey,
        core_collection: Pubkey,
        metadata_base_url: String,
    ) -> Result<()> {
        crate::instructions::config::handle_initialize_config(
            ctx,
            merkle_tree,
            core_collection,
            metadata_base_url,
        )
    }

    /// Points new receipts at another tree, collection or metadata URL.
    pub fn update_config(
        ctx: Context<UpdateConfig>,
        merkle_tree: Pubkey,
        core_collection: Pubkey,
        metadata_base_url: String,
    ) -> Result<()> {
        crate::instructions::config::handle_update_config(
            ctx,
            merkle_tree,
            core_collection,
            metadata_base_url,
        )
    }

    /// Registers a document fingerprint and mints a soulbound cNFT receipt
    /// to the signer. The document name never goes on-chain; the type goes
    /// as a public code from a fixed list.
    pub fn register_v2(
        ctx: Context<RegisterV2>,
        record_hash: [u8; 32],
        scheme: u8,
        document_type: u16,
        metadata_commitment: [u8; 32],
    ) -> Result<()> {
        crate::instructions::register_v2::handle_register_v2(
            ctx,
            record_hash,
            scheme,
            document_type,
            metadata_commitment,
        )
    }

    /// Issues a transferable record and gives control to `holder`.
    pub fn issue_record(
        ctx: Context<IssueRecord>,
        document_hash: [u8; 32],
        metadata_commitment: [u8; 32],
        holder: Pubkey,
    ) -> Result<()> {
        crate::instructions::transferable::handle_issue_record(
            ctx,
            document_hash,
            metadata_commitment,
            holder,
        )
    }

    /// The person in control passes control to someone else.
    pub fn transfer_control(ctx: Context<ControllerAction>, new_controller: Pubkey) -> Result<()> {
        crate::instructions::transferable::handle_transfer_control(ctx, new_controller)
    }

    /// The issuer proposes a new version of the document.
    pub fn propose_amendment(
        ctx: Context<ProposeAmendment>,
        new_document_hash: [u8; 32],
        new_metadata_commitment: [u8; 32],
    ) -> Result<()> {
        crate::instructions::transferable::handle_propose_amendment(
            ctx,
            new_document_hash,
            new_metadata_commitment,
        )
    }

    pub fn cancel_amendment(ctx: Context<IssuerAction>) -> Result<()> {
        crate::instructions::transferable::handle_cancel_amendment(ctx)
    }

    /// The person in control accepts the pending amendment.
    pub fn accept_amendment(
        ctx: Context<AcceptAmendment>,
        expected_document_hash: [u8; 32],
    ) -> Result<()> {
        crate::instructions::transferable::handle_accept_amendment(ctx, expected_document_hash)
    }

    /// The person in control surrenders the record to the issuer.
    pub fn surrender(ctx: Context<ControllerAction>) -> Result<()> {
        crate::instructions::transferable::handle_surrender(ctx)
    }

    /// The issuer ends a surrendered record (0 fulfilled, 1 replaced by paper, 2 other).
    pub fn terminate(ctx: Context<IssuerAction>, reason: u8) -> Result<()> {
        crate::instructions::transferable::handle_terminate(ctx, reason)
    }
}
