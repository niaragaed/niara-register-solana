use anchor_lang::prelude::*;
use mpl_bubblegum::{
    accounts::TreeConfig,
    instructions::{MintV2Cpi, MintV2CpiAccounts, MintV2InstructionArgs},
    types::{MetadataArgsV2, TokenStandard},
    utils::get_asset_id,
};

use crate::{
    constants::*,
    error::ErrorCode,
    instructions::commit::commitment_of,
    instructions::orb::check_orb_attestation,
    state::{Commitment, Config, DocumentRegisteredV3, OrbConfig, RecordV3},
};

/// Reveal step of commit-reveal: registers a document fingerprint that the
/// signer committed to in an earlier slot, and mints the soulbound receipt.
#[derive(Accounts)]
#[instruction(record_hash: [u8; 32])]
pub struct RegisterV3<'info> {
    /// Signs, pays the record rent and the Bubblegum mint fee, and receives
    /// the receipt. No Niara custody in between.
    #[account(mut)]
    pub signer: Signer<'info>,

    /// The signer's own commitment to (record_hash, nonce). Its address is
    /// derived from the signer, so a copy of this transaction sent by someone
    /// else points at an account that does not exist. The address is checked
    /// in the handler (the seed is a hash of the arguments, which the IDL
    /// cannot express). Closed here.
    #[account(mut, close = signer, has_one = signer)]
    pub commitment: Box<Account<'info, Commitment>>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = merkle_tree @ ErrorCode::ConfigMismatch,
        has_one = core_collection @ ErrorCode::ConfigMismatch,
    )]
    pub config: Box<Account<'info, Config>>,

    /// `init` fails if the PDA already exists: one record per hash, forever.
    #[account(
        init,
        payer = signer,
        space = 8 + RecordV3::INIT_SPACE,
        seeds = [RECORD_V3_SEED, record_hash.as_ref()],
        bump
    )]
    pub record: Box<Account<'info, RecordV3>>,

    /// CHECK: the v2 PDA for the same hash; must not hold a v2 record.
    #[account(seeds = [RECORD_V2_SEED, record_hash.as_ref()], bump)]
    pub record_v2: UncheckedAccount<'info>,

    /// CHECK: the v1 PDA for the same hash; must not hold a v1 record.
    #[account(seeds = [ASSINATURA_SEED, record_hash.as_ref()], bump)]
    pub legacy_record: UncheckedAccount<'info>,

    /// Needed only with an ORB attestation.
    #[account(seeds = [ORB_CONFIG_SEED], bump = orb_config.bump)]
    pub orb_config: Option<Box<Account<'info, OrbConfig>>>,

    /// CHECK: address checked; read to find the Ed25519 attestation instruction.
    #[account(address = INSTRUCTIONS_SYSVAR_ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,

    /// CHECK: PDA that signs the mint as tree delegate and collection authority.
    #[account(seeds = [RECEIPT_AUTHORITY_SEED], bump = config.receipt_authority_bump)]
    pub receipt_authority: UncheckedAccount<'info>,

    /// CHECK: Bubblegum tree config PDA; Bubblegum validates it.
    #[account(
        mut,
        seeds = [merkle_tree.key().as_ref()],
        bump,
        seeds::program = MPL_BUBBLEGUM_ID
    )]
    pub tree_config: UncheckedAccount<'info>,

    /// CHECK: must equal config.merkle_tree (has_one above).
    #[account(mut)]
    pub merkle_tree: UncheckedAccount<'info>,

    /// CHECK: must equal config.core_collection (has_one above).
    #[account(mut)]
    pub core_collection: UncheckedAccount<'info>,

    /// CHECK: Bubblegum's signer for MPL-Core CPIs.
    #[account(seeds = [MPL_CORE_CPI_SIGNER_SEED], bump, seeds::program = MPL_BUBBLEGUM_ID)]
    pub mpl_core_cpi_signer: UncheckedAccount<'info>,

    /// CHECK: address checked.
    #[account(address = MPL_NOOP_ID)]
    pub log_wrapper: UncheckedAccount<'info>,

    /// CHECK: address checked.
    #[account(address = MPL_ACCOUNT_COMPRESSION_ID)]
    pub compression_program: UncheckedAccount<'info>,

    /// CHECK: address checked.
    #[account(address = MPL_CORE_ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

    /// CHECK: address checked.
    #[account(address = MPL_BUBBLEGUM_ID)]
    pub bubblegum_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

fn hex(bytes: &[u8]) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push(DIGITS[(b >> 4) as usize] as char);
        out.push(DIGITS[(b & 0x0f) as usize] as char);
    }
    out
}

fn is_unused(account: &UncheckedAccount) -> bool {
    // Only the data matters; anyone can send lamports to an address.
    account.data_is_empty() && account.owner == &anchor_lang::system_program::ID
}

#[allow(clippy::too_many_arguments)]
pub fn handle_register_v3(
    ctx: Context<RegisterV3>,
    record_hash: [u8; 32],
    scheme: u8,
    document_type: u16,
    metadata_commitment: [u8; 32],
    nonce: [u8; 32],
    orb_report_hash: [u8; 32],
) -> Result<()> {
    require!(record_hash != [0u8; 32], ErrorCode::HashInvalido);
    require!(scheme <= SCHEME_SALTED_SHA256, ErrorCode::UnknownScheme);
    require!(document_type != 0, ErrorCode::InvalidDocumentType);

    // One record per hash across v1, v2 and v3.
    require!(
        is_unused(&ctx.accounts.legacy_record),
        ErrorCode::AlreadyRegisteredV1
    );
    require!(
        is_unused(&ctx.accounts.record_v2),
        ErrorCode::AlreadyRegisteredV2
    );

    // The commitment account must be the one at
    // ["commitment", signer, commitment_of(signer, record_hash, nonce)]:
    // that binds it to this signer, hash and nonce.
    let pending = &ctx.accounts.commitment;
    let signer_key = ctx.accounts.signer.key();
    let c = commitment_of(&signer_key, &record_hash, &nonce);
    let expected = Pubkey::create_program_address(
        &[
            COMMITMENT_SEED,
            signer_key.as_ref(),
            c.as_ref(),
            &[pending.bump],
        ],
        ctx.program_id,
    )
    .map_err(|_| error!(ErrorCode::CommitmentMismatch))?;
    require_keys_eq!(pending.key(), expected, ErrorCode::CommitmentMismatch);

    // It must come from an earlier slot and still be fresh.
    let clock = Clock::get()?;
    require!(clock.slot > pending.slot, ErrorCode::RevealTooEarly);
    require!(
        clock.unix_timestamp <= pending.timestamp + COMMITMENT_TTL_SECONDS,
        ErrorCode::CommitmentExpired
    );

    if orb_report_hash != [0u8; 32] {
        let orb = ctx
            .accounts
            .orb_config
            .as_ref()
            .ok_or(error!(ErrorCode::OrbDisabled))?;
        require!(orb.attester != Pubkey::default(), ErrorCode::OrbDisabled);
        check_orb_attestation(
            &ctx.accounts.instructions_sysvar.to_account_info(),
            &orb.attester,
            &record_hash,
            &orb_report_hash,
            &ctx.accounts.signer.key(),
        )?;
    }

    // The leaf nonce of the next mint is the tree's current mint count.
    let leaf_nonce = {
        let data = ctx.accounts.tree_config.try_borrow_data()?;
        TreeConfig::from_bytes(&data)
            .map_err(|_| error!(ErrorCode::InvalidTreeConfig))?
            .num_minted
    };
    let merkle_tree_key = ctx.accounts.merkle_tree.key();
    let asset_id = get_asset_id(&merkle_tree_key, leaf_nonce);

    let config = &ctx.accounts.config;
    let metadata = MetadataArgsV2 {
        name: RECEIPT_NAME.to_string(),
        symbol: RECEIPT_SYMBOL.to_string(),
        uri: format!("{}{}", config.metadata_base_url, hex(&record_hash)),
        seller_fee_basis_points: 0,
        primary_sale_happened: false,
        is_mutable: false,
        token_standard: Some(TokenStandard::NonFungible),
        creators: vec![],
        collection: Some(ctx.accounts.core_collection.key()),
    };

    let receipt_authority = ctx.accounts.receipt_authority.to_account_info();
    let signer_seeds: &[&[&[u8]]] = &[&[RECEIPT_AUTHORITY_SEED, &[config.receipt_authority_bump]]];

    MintV2Cpi::new(
        &ctx.accounts.bubblegum_program.to_account_info(),
        MintV2CpiAccounts {
            tree_config: &ctx.accounts.tree_config.to_account_info(),
            payer: &ctx.accounts.signer.to_account_info(),
            tree_creator_or_delegate: Some(&receipt_authority),
            collection_authority: Some(&receipt_authority),
            leaf_owner: &ctx.accounts.signer.to_account_info(),
            leaf_delegate: None,
            merkle_tree: &ctx.accounts.merkle_tree.to_account_info(),
            core_collection: Some(&ctx.accounts.core_collection.to_account_info()),
            mpl_core_cpi_signer: Some(&ctx.accounts.mpl_core_cpi_signer.to_account_info()),
            log_wrapper: &ctx.accounts.log_wrapper.to_account_info(),
            compression_program: &ctx.accounts.compression_program.to_account_info(),
            mpl_core_program: &ctx.accounts.mpl_core_program.to_account_info(),
            system_program: &ctx.accounts.system_program.to_account_info(),
        },
        MintV2InstructionArgs {
            metadata,
            asset_data: None,
            asset_data_schema: None,
        },
    )
    .invoke_signed(signer_seeds)?;

    let record = &mut ctx.accounts.record;
    record.signer = ctx.accounts.signer.key();
    record.record_hash = record_hash;
    record.scheme = scheme;
    record.document_type = document_type;
    record.metadata_commitment = metadata_commitment;
    record.orb_report_hash = orb_report_hash;
    record.timestamp = clock.unix_timestamp;
    record.slot = clock.slot;
    record.receipt_asset_id = asset_id;
    record.receipt_tree = merkle_tree_key;
    record.receipt_nonce = leaf_nonce;
    record.bump = ctx.bumps.record;

    emit!(DocumentRegisteredV3 {
        record_hash,
        signer: record.signer,
        scheme,
        document_type,
        metadata_commitment,
        orb_report_hash,
        timestamp: record.timestamp,
        slot: record.slot,
        receipt_asset_id: asset_id,
    });

    Ok(())
}
