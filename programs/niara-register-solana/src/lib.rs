//! Niara Register on Solana: proof of existence and authorship for documents.
//!
//! v3 registers in two steps (commit-reveal), so a pending registration cannot
//! be front-run: `commit` stores SHA-256("niara-commit-v1" || program ||
//! signer || record_hash || nonce) under the signer's address, and
//! `register_v3`, in a later slot, reveals the hash and nonce. A record can
//! also carry the hash of an ORB analysis report, accepted only with an
//! Ed25519 signature from the ORB attester key. The record stores the record
//! hash, scheme, document type code, a salted metadata commitment and the ORB
//! report hash, and a non-transferable compressed NFT receipt (Bubblegum v2,
//! MPL-Core collection frozen by a permanent freeze delegate) goes to the
//! signer in the same transaction. Same semantics as SignatureRegistryV3.sol.
//!
//! v2 (`register_v2`, one transaction, front-runnable) and v1 (`registrar`,
//! plain-text name and type) were removed. Their accounts (`RecordV2`,
//! `Assinatura`) stay on-chain and readable, and a hash with a v1 or v2 record
//! cannot be registered again.
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

    /// Points new receipts at another tree, collection or metadata URL. Only the
    /// program's current upgrade authority (e.g. the Squads vault) can call it.
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

    /// Commit step of commit-reveal (see `instructions/commit.rs`).
    pub fn commit(ctx: Context<Commit>, commitment: [u8; 32]) -> Result<()> {
        crate::instructions::commit::handle_commit(ctx, commitment)
    }

    /// Closes the signer's pending commitment and returns its rent.
    pub fn cancel_commitment(_ctx: Context<CancelCommitment>, _commitment: [u8; 32]) -> Result<()> {
        Ok(())
    }

    /// Reveal step: registers a committed document fingerprint and mints a
    /// soulbound cNFT receipt to the signer. With a non-zero
    /// `orb_report_hash`, the previous instruction must be the ORB attester's
    /// Ed25519 signature (see `instructions/orb.rs`).
    #[allow(clippy::too_many_arguments)]
    pub fn register_v3(
        ctx: Context<RegisterV3>,
        record_hash: [u8; 32],
        scheme: u8,
        document_type: u16,
        metadata_commitment: [u8; 32],
        nonce: [u8; 32],
        orb_report_hash: [u8; 32],
    ) -> Result<()> {
        crate::instructions::register_v3::handle_register_v3(
            ctx,
            record_hash,
            scheme,
            document_type,
            metadata_commitment,
            nonce,
            orb_report_hash,
        )
    }

    /// Creates the ORB config with its attester key. Program upgrade authority only.
    pub fn initialize_orb_config(
        ctx: Context<InitializeOrbConfig>,
        attester: Pubkey,
    ) -> Result<()> {
        crate::instructions::orb::handle_initialize_orb_config(ctx, attester)
    }

    /// Changes the ORB attester (current attester or upgrade authority).
    /// Pubkey::default() turns ORB off.
    pub fn set_orb_attester(ctx: Context<SetOrbAttester>, attester: Pubkey) -> Result<()> {
        crate::instructions::orb::handle_set_orb_attester(ctx, attester)
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
