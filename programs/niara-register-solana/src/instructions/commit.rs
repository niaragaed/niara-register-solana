use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
    state::{Commitment, Committed},
};

/// SHA-256("niara-commit-v1" || program_id || signer || record_hash || nonce).
/// Same recipe as the site's lib/commit-reveal.ts.
pub fn commitment_of(signer: &Pubkey, record_hash: &[u8; 32], nonce: &[u8; 32]) -> [u8; 32] {
    solana_sha256_hasher::hashv(&[
        COMMIT_DOMAIN,
        crate::ID.as_ref(),
        signer.as_ref(),
        record_hash,
        nonce,
    ])
    .to_bytes()
}

/// Commit step: stores a commitment that reveals nothing about the document.
/// `init` fails if the same signer already has this commitment pending, so a
/// live commitment cannot be reset; cancel it first to make it again.
#[derive(Accounts)]
#[instruction(commitment: [u8; 32])]
pub struct Commit<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        init,
        payer = signer,
        space = 8 + Commitment::INIT_SPACE,
        seeds = [COMMITMENT_SEED, signer.key().as_ref(), commitment.as_ref()],
        bump
    )]
    pub pending: Account<'info, Commitment>,

    pub system_program: Program<'info, System>,
}

/// Closes a pending commitment (for example an expired one) and returns its rent.
#[derive(Accounts)]
#[instruction(commitment: [u8; 32])]
pub struct CancelCommitment<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        close = signer,
        seeds = [COMMITMENT_SEED, signer.key().as_ref(), commitment.as_ref()],
        bump = pending.bump,
        has_one = signer,
    )]
    pub pending: Account<'info, Commitment>,
}

pub fn handle_commit(ctx: Context<Commit>, commitment: [u8; 32]) -> Result<()> {
    require!(commitment != [0u8; 32], ErrorCode::InvalidCommitment);
    let clock = Clock::get()?;
    let pending = &mut ctx.accounts.pending;
    pending.signer = ctx.accounts.signer.key();
    pending.slot = clock.slot;
    pending.timestamp = clock.unix_timestamp;
    pending.bump = ctx.bumps.pending;
    emit!(Committed {
        signer: pending.signer,
        commitment,
        slot: clock.slot,
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Same vector as Niara-Register/tests/commit-reveal.test.ts (Python hashlib).
    #[test]
    fn commitment_vector() {
        let signer = pubkey!("Ed25519SigVerify111111111111111111111111111");
        let mut record_hash = [0u8; 32];
        let hex = "0b8f9601ddc97b9b8001400ae6db7375758265717411c37a0da22464297c560d";
        for (i, b) in record_hash.iter_mut().enumerate() {
            *b = u8::from_str_radix(&hex[2 * i..2 * i + 2], 16).unwrap();
        }
        let mut nonce = [0u8; 32];
        nonce[31] = 7;
        let c = commitment_of(&signer, &record_hash, &nonce);
        let got: String = c.iter().map(|b| format!("{b:02x}")).collect();
        assert_eq!(
            got,
            "3a22bcde8920bf427f5bc55f80e19863944009f9b189f953777dbb00b20dcc19"
        );
    }

    #[test]
    fn orb_message_is_domain_separated_digest() {
        let signer = pubkey!("Ed25519SigVerify111111111111111111111111111");
        let m = crate::instructions::orb::orb_message(&[1u8; 32], &[2u8; 32], &signer);
        let mut raw = Vec::new();
        raw.extend_from_slice(b"niara-orb-v1");
        raw.extend_from_slice(crate::ID.as_ref());
        raw.extend_from_slice(&[1u8; 32]);
        raw.extend_from_slice(&[2u8; 32]);
        raw.extend_from_slice(signer.as_ref());
        assert_eq!(raw.len(), 140);
        assert_eq!(m, solana_sha256_hasher::hash(&raw).to_bytes());
        // Bound to the signer.
        let other = crate::instructions::orb::orb_message(&[1u8; 32], &[2u8; 32], &crate::ID);
        assert_ne!(m, other);
    }
}
