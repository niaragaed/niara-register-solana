use anchor_lang::prelude::*;

use crate::{constants::*, error::ErrorCode, program::NiaraRegisterSolana, state::Config};

/// Creates the singleton config. Only the program's upgrade authority can,
/// so nobody can point receipts at a tree or collection of their own.
#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + Config::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,

    #[account(constraint = program.programdata_address()? == Some(program_data.key()) @ ErrorCode::NotUpgradeAuthority)]
    pub program: Program<'info, NiaraRegisterSolana>,

    #[account(constraint = program_data.upgrade_authority_address == Some(admin.key()) @ ErrorCode::NotUpgradeAuthority)]
    pub program_data: Account<'info, ProgramData>,

    pub system_program: Program<'info, System>,
}

/// Replaces the tree (when full), the collection or the metadata URL.
/// Existing records and receipts are untouched. Only the program's *current*
/// upgrade authority can call it (not whoever initialized the config), so
/// moving the upgrade authority to a multisig moves this power with it.
#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    pub admin: Signer<'info>,

    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,

    #[account(constraint = program.programdata_address()? == Some(program_data.key()) @ ErrorCode::NotUpgradeAuthority)]
    pub program: Program<'info, NiaraRegisterSolana>,

    #[account(constraint = program_data.upgrade_authority_address == Some(admin.key()) @ ErrorCode::NotUpgradeAuthority)]
    pub program_data: Account<'info, ProgramData>,
}

fn validate_base_url(url: &str) -> Result<()> {
    require!(
        !url.is_empty() && url.len() <= MAX_METADATA_BASE_URL,
        ErrorCode::InvalidBaseUrl
    );
    Ok(())
}

pub fn handle_initialize_config(
    ctx: Context<InitializeConfig>,
    merkle_tree: Pubkey,
    core_collection: Pubkey,
    metadata_base_url: String,
) -> Result<()> {
    validate_base_url(&metadata_base_url)?;
    let (_, receipt_authority_bump) =
        Pubkey::find_program_address(&[RECEIPT_AUTHORITY_SEED], ctx.program_id);

    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.merkle_tree = merkle_tree;
    config.core_collection = core_collection;
    config.metadata_base_url = metadata_base_url;
    config.receipt_authority_bump = receipt_authority_bump;
    config.bump = ctx.bumps.config;
    Ok(())
}

pub fn handle_update_config(
    ctx: Context<UpdateConfig>,
    merkle_tree: Pubkey,
    core_collection: Pubkey,
    metadata_base_url: String,
) -> Result<()> {
    validate_base_url(&metadata_base_url)?;
    let config = &mut ctx.accounts.config;
    // Record who holds the power now (the upgrade authority, e.g. a Squads vault).
    config.admin = ctx.accounts.admin.key();
    config.merkle_tree = merkle_tree;
    config.core_collection = core_collection;
    config.metadata_base_url = metadata_base_url;
    Ok(())
}
