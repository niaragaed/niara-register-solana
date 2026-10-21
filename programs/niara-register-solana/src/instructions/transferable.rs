//! Electronic transferable records designed to line up with the UNCITRAL
//! Model Law on Electronic Transferable Records (MLETR): singularity (one
//! record per document hash, and no hash is ever reused), exclusive control
//! (`controller` is the person in control and the only key that can pass it
//! on), integrity (the hash changes only through an amendment the issuer
//! proposes and the controller accepts), surrender and termination
//! (including replacement by paper).
//!
//! "Designed to line up with" is the accurate claim: MLETR only has legal
//! effect where a jurisdiction has enacted it, and Brazil has not.

use anchor_lang::prelude::*;

use crate::{constants::*, error::ErrorCode, state::*};

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

#[derive(Accounts)]
#[instruction(document_hash: [u8; 32])]
pub struct IssueRecord<'info> {
    #[account(mut)]
    pub issuer: Signer<'info>,

    #[account(
        init,
        payer = issuer,
        space = 8 + TransferableRecord::INIT_SPACE,
        seeds = [ETR_SEED, document_hash.as_ref()],
        bump
    )]
    pub record: Account<'info, TransferableRecord>,

    /// `init` fails if this hash was ever used before (singularity).
    #[account(
        init,
        payer = issuer,
        space = 8 + UsedHash::INIT_SPACE,
        seeds = [ETR_HASH_SEED, document_hash.as_ref()],
        bump
    )]
    pub used_hash: Account<'info, UsedHash>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ControllerAction<'info> {
    pub controller: Signer<'info>,

    #[account(mut, has_one = controller @ ErrorCode::NotController)]
    pub record: Account<'info, TransferableRecord>,
}

#[derive(Accounts)]
#[instruction(new_document_hash: [u8; 32])]
pub struct ProposeAmendment<'info> {
    pub issuer: Signer<'info>,

    #[account(mut, has_one = issuer @ ErrorCode::NotIssuer)]
    pub record: Account<'info, TransferableRecord>,

    /// CHECK: marker PDA of the proposed hash; must not exist yet.
    #[account(seeds = [ETR_HASH_SEED, new_document_hash.as_ref()], bump)]
    pub new_hash_marker: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct IssuerAction<'info> {
    pub issuer: Signer<'info>,

    #[account(mut, has_one = issuer @ ErrorCode::NotIssuer)]
    pub record: Account<'info, TransferableRecord>,
}

#[derive(Accounts)]
#[instruction(expected_document_hash: [u8; 32])]
pub struct AcceptAmendment<'info> {
    #[account(mut)]
    pub controller: Signer<'info>,

    #[account(mut, has_one = controller @ ErrorCode::NotController)]
    pub record: Account<'info, TransferableRecord>,

    /// `init` fails if the hash was used meanwhile.
    #[account(
        init,
        payer = controller,
        space = 8 + UsedHash::INIT_SPACE,
        seeds = [ETR_HASH_SEED, expected_document_hash.as_ref()],
        bump
    )]
    pub used_hash: Account<'info, UsedHash>,

    pub system_program: Program<'info, System>,
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

fn require_active(record: &TransferableRecord) -> Result<()> {
    require!(record.status == ETR_STATUS_ACTIVE, ErrorCode::NotActive);
    Ok(())
}

pub fn handle_issue_record(
    ctx: Context<IssueRecord>,
    document_hash: [u8; 32],
    metadata_commitment: [u8; 32],
    holder: Pubkey,
) -> Result<()> {
    require!(document_hash != [0u8; 32], ErrorCode::HashInvalido);
    require!(holder != Pubkey::default(), ErrorCode::InvalidHolder);

    let record = &mut ctx.accounts.record;
    record.issuer = ctx.accounts.issuer.key();
    record.controller = holder;
    record.original_hash = document_hash;
    record.document_hash = document_hash;
    record.metadata_commitment = metadata_commitment;
    record.version = 1;
    record.status = ETR_STATUS_ACTIVE;
    record.issued_at = Clock::get()?.unix_timestamp;
    record.pending_hash = [0u8; 32];
    record.pending_metadata_commitment = [0u8; 32];
    record.bump = ctx.bumps.record;
    ctx.accounts.used_hash.bump = ctx.bumps.used_hash;

    emit!(RecordIssued {
        record: record.key(),
        issuer: record.issuer,
        holder,
        document_hash,
        metadata_commitment,
    });
    Ok(())
}

pub fn handle_transfer_control(ctx: Context<ControllerAction>, new_controller: Pubkey) -> Result<()> {
    let record = &mut ctx.accounts.record;
    require_active(record)?;
    require!(new_controller != Pubkey::default(), ErrorCode::InvalidHolder);

    let from = record.controller;
    record.controller = new_controller;
    emit!(ControlTransferred {
        record: record.key(),
        from,
        to: new_controller,
    });
    Ok(())
}

pub fn handle_propose_amendment(
    ctx: Context<ProposeAmendment>,
    new_document_hash: [u8; 32],
    new_metadata_commitment: [u8; 32],
) -> Result<()> {
    let record = &mut ctx.accounts.record;
    require_active(record)?;
    require!(new_document_hash != [0u8; 32], ErrorCode::HashInvalido);
    require!(
        ctx.accounts.new_hash_marker.data_is_empty(),
        ErrorCode::HashAlreadyUsed
    );

    record.pending_hash = new_document_hash;
    record.pending_metadata_commitment = new_metadata_commitment;
    emit!(AmendmentProposed {
        record: record.key(),
        new_document_hash,
        new_metadata_commitment,
    });
    Ok(())
}

pub fn handle_cancel_amendment(ctx: Context<IssuerAction>) -> Result<()> {
    let record = &mut ctx.accounts.record;
    require_active(record)?;
    require!(record.pending_hash != [0u8; 32], ErrorCode::NoPendingAmendment);

    record.pending_hash = [0u8; 32];
    record.pending_metadata_commitment = [0u8; 32];
    emit!(AmendmentCancelled { record: record.key() });
    Ok(())
}

pub fn handle_accept_amendment(
    ctx: Context<AcceptAmendment>,
    expected_document_hash: [u8; 32],
) -> Result<()> {
    let record = &mut ctx.accounts.record;
    require_active(record)?;
    require!(record.pending_hash != [0u8; 32], ErrorCode::NoPendingAmendment);
    require!(
        record.pending_hash == expected_document_hash,
        ErrorCode::AmendmentMismatch
    );

    record.document_hash = record.pending_hash;
    record.metadata_commitment = record.pending_metadata_commitment;
    record.version += 1;
    record.pending_hash = [0u8; 32];
    record.pending_metadata_commitment = [0u8; 32];
    ctx.accounts.used_hash.bump = ctx.bumps.used_hash;

    emit!(RecordAmended {
        record: record.key(),
        version: record.version,
        document_hash: record.document_hash,
        metadata_commitment: record.metadata_commitment,
    });
    Ok(())
}

/// The controller hands the record back to the issuer (for payment/delivery,
/// or to ask for a paper replacement). Transfers stop from here on.
pub fn handle_surrender(ctx: Context<ControllerAction>) -> Result<()> {
    let record = &mut ctx.accounts.record;
    require_active(record)?;

    let by = record.controller;
    record.controller = record.issuer;
    record.status = ETR_STATUS_SURRENDERED;
    record.pending_hash = [0u8; 32];
    record.pending_metadata_commitment = [0u8; 32];
    emit!(RecordSurrendered {
        record: record.key(),
        by,
    });
    Ok(())
}

/// The issuer ends a surrendered record. The account stays as evidence and
/// its hashes stay used.
pub fn handle_terminate(ctx: Context<IssuerAction>, reason: u8) -> Result<()> {
    let record = &mut ctx.accounts.record;
    require!(
        record.status == ETR_STATUS_SURRENDERED,
        ErrorCode::NotSurrendered
    );
    require!(reason <= ETR_REASON_OTHER, ErrorCode::UnknownTerminationReason);

    record.status = ETR_STATUS_TERMINATED;
    emit!(RecordTerminated {
        record: record.key(),
        reason,
    });
    Ok(())
}
