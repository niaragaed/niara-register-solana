use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
    state::{Assinatura, DocumentoRegistrado},
};

#[derive(Accounts)]
#[instruction(hash_documento: [u8; 32])]
pub struct Registrar<'info> {
    /// The signer pays the rent for the record account, with no Niara
    /// custody in between.
    #[account(mut)]
    pub assinante: Signer<'info>,

    /// `init` fails if the PDA already exists: a registered hash can never be
    /// overwritten or back-dated.
    #[account(
        init,
        payer = assinante,
        space = 8 + Assinatura::INIT_SPACE,
        seeds = [ASSINATURA_SEED, hash_documento.as_ref()],
        bump
    )]
    pub assinatura: Account<'info, Assinatura>,

    pub system_program: Program<'info, System>,
}

pub fn handle_registrar(
    ctx: Context<Registrar>,
    hash_documento: [u8; 32],
    nome_documento: String,
    tipo_documento: String,
) -> Result<()> {
    require!(hash_documento != [0u8; 32], ErrorCode::HashInvalido);

    let nome = nome_documento.trim();
    let tipo = tipo_documento.trim();
    require!(
        !nome.is_empty() && nome.len() <= MAX_NOME_DOCUMENTO,
        ErrorCode::NomeInvalido
    );
    require!(
        !tipo.is_empty() && tipo.len() <= MAX_TIPO_DOCUMENTO,
        ErrorCode::TipoInvalido
    );

    let clock = Clock::get()?;
    let assinatura = &mut ctx.accounts.assinatura;
    assinatura.assinante = ctx.accounts.assinante.key();
    assinatura.hash_documento = hash_documento;
    assinatura.timestamp = clock.unix_timestamp;
    assinatura.slot = clock.slot;
    assinatura.nome_documento = nome.to_string();
    assinatura.tipo_documento = tipo.to_string();
    assinatura.bump = ctx.bumps.assinatura;

    emit!(DocumentoRegistrado {
        hash_documento,
        assinante: assinatura.assinante,
        nome_documento: assinatura.nome_documento.clone(),
        tipo_documento: assinatura.tipo_documento.clone(),
        timestamp: assinatura.timestamp,
        slot: assinatura.slot,
    });

    Ok(())
}
