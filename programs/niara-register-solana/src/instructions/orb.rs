//! ORB attestation: a record can carry the hash of an ORB analysis report only
//! if the ORB attester key signed (record hash, report hash, signer) with
//! Ed25519. The signature is checked by Solana's Ed25519 program in the
//! instruction right before register_v3; this program reads that instruction
//! from the instructions sysvar and checks the key and the message.
use anchor_lang::prelude::*;
use solana_instructions_sysvar::{load_current_index_checked, load_instruction_at_checked};

use crate::{
    constants::*,
    error::ErrorCode,
    program::NiaraRegisterSolana,
    state::{OrbAttesterChanged, OrbConfig},
};

/// Creates the ORB config. Program upgrade authority only.
#[derive(Accounts)]
pub struct InitializeOrbConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + OrbConfig::INIT_SPACE,
        seeds = [ORB_CONFIG_SEED],
        bump
    )]
    pub orb_config: Account<'info, OrbConfig>,

    #[account(constraint = program.programdata_address()? == Some(program_data.key()) @ ErrorCode::NotUpgradeAuthority)]
    pub program: Program<'info, NiaraRegisterSolana>,

    #[account(constraint = program_data.upgrade_authority_address == Some(admin.key()) @ ErrorCode::NotUpgradeAuthority)]
    pub program_data: Account<'info, ProgramData>,

    pub system_program: Program<'info, System>,
}

/// Changes the attester key. Allowed for the current attester (key rotation)
/// or the program's current upgrade authority (which can upgrade the program
/// anyway, so this adds no power it did not have).
#[derive(Accounts)]
pub struct SetOrbAttester<'info> {
    pub authority: Signer<'info>,

    #[account(mut, seeds = [ORB_CONFIG_SEED], bump = orb_config.bump)]
    pub orb_config: Account<'info, OrbConfig>,

    #[account(constraint = program.programdata_address()? == Some(program_data.key()) @ ErrorCode::NotUpgradeAuthority)]
    pub program: Program<'info, NiaraRegisterSolana>,

    pub program_data: Account<'info, ProgramData>,
}

pub fn handle_initialize_orb_config(
    ctx: Context<InitializeOrbConfig>,
    attester: Pubkey,
) -> Result<()> {
    let cfg = &mut ctx.accounts.orb_config;
    cfg.attester = attester;
    cfg.bump = ctx.bumps.orb_config;
    emit!(OrbAttesterChanged {
        previous: Pubkey::default(),
        attester,
    });
    Ok(())
}

pub fn handle_set_orb_attester(ctx: Context<SetOrbAttester>, attester: Pubkey) -> Result<()> {
    let who = ctx.accounts.authority.key();
    let cfg = &mut ctx.accounts.orb_config;
    let is_attester = cfg.attester != Pubkey::default() && cfg.attester == who;
    let is_upgrade_authority = ctx.accounts.program_data.upgrade_authority_address == Some(who);
    require!(
        is_attester || is_upgrade_authority,
        ErrorCode::NotOrbAuthority
    );
    emit!(OrbAttesterChanged {
        previous: cfg.attester,
        attester,
    });
    cfg.attester = attester;
    Ok(())
}

/// The 32-byte message the attester signs:
/// SHA-256("niara-orb-v1" || program_id || record_hash || report_hash || signer).
/// A digest rather than the raw 140 bytes, so register_v3 with its Ed25519
/// instruction still fits in one legacy transaction (1232 bytes).
pub fn orb_message(record_hash: &[u8; 32], report_hash: &[u8; 32], signer: &Pubkey) -> [u8; 32] {
    solana_sha256_hasher::hashv(&[
        ORB_DOMAIN,
        crate::ID.as_ref(),
        record_hash,
        report_hash,
        signer.as_ref(),
    ])
    .to_bytes()
}

fn read_u16(data: &[u8], at: usize) -> Result<u16> {
    let b = data
        .get(at..at + 2)
        .ok_or(error!(ErrorCode::InvalidOrbAttestation))?;
    Ok(u16::from_le_bytes([b[0], b[1]]))
}

/// Checks that the instruction right before the current one is an Ed25519
/// program instruction with exactly one signature, by `attester`, over
/// `orb_message(...)`, with all its data inside that same instruction.
pub fn check_orb_attestation(
    sysvar: &AccountInfo,
    attester: &Pubkey,
    record_hash: &[u8; 32],
    report_hash: &[u8; 32],
    signer: &Pubkey,
) -> Result<()> {
    let current = load_current_index_checked(sysvar)?;
    require!(current > 0, ErrorCode::InvalidOrbAttestation);
    let ix = load_instruction_at_checked((current - 1) as usize, sysvar)?;
    require!(
        ix.program_id == ED25519_PROGRAM_ID && ix.accounts.is_empty(),
        ErrorCode::InvalidOrbAttestation
    );

    // Layout: [num_signatures u8, padding u8, then per signature 7 x u16:
    // sig_offset, sig_ix, pubkey_offset, pubkey_ix, msg_offset, msg_size, msg_ix].
    let d = &ix.data;
    require!(d.len() >= 16 && d[0] == 1, ErrorCode::InvalidOrbAttestation);
    let sig_ix = read_u16(d, 4)?;
    let pk_offset = read_u16(d, 6)? as usize;
    let pk_ix = read_u16(d, 8)?;
    let msg_offset = read_u16(d, 10)? as usize;
    let msg_size = read_u16(d, 12)? as usize;
    let msg_ix = read_u16(d, 14)?;
    // u16::MAX = "this instruction": the data checked is the data we read.
    require!(
        sig_ix == u16::MAX && pk_ix == u16::MAX && msg_ix == u16::MAX,
        ErrorCode::InvalidOrbAttestation
    );

    let pk = d
        .get(pk_offset..pk_offset + 32)
        .ok_or(error!(ErrorCode::InvalidOrbAttestation))?;
    require!(pk == attester.as_ref(), ErrorCode::InvalidOrbAttestation);

    let msg = d
        .get(msg_offset..msg_offset + msg_size)
        .ok_or(error!(ErrorCode::InvalidOrbAttestation))?;
    require!(
        msg == orb_message(record_hash, report_hash, signer).as_ref(),
        ErrorCode::InvalidOrbAttestation
    );
    Ok(())
}
