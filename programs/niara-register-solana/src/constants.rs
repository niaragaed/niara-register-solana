use anchor_lang::prelude::*;

/// PDA seed of each record: ["assinatura", hash_sha256].
/// Because the PDA address is derived from the hash itself, there is at most
/// ONE account per document. That is what guarantees a single record per hash
/// (parity with `DocumentoJaRegistrado` in RegistroAssinaturas.sol).
#[constant]
pub const ASSINATURA_SEED: &[u8] = b"assinatura";

/// Limits in BYTES (UTF-8), not characters. They keep the account size fixed
/// and the rent cost predictable. (No #[constant]: the IDL does not serialize usize.)
pub const MAX_NOME_DOCUMENTO: usize = 128;

pub const MAX_TIPO_DOCUMENTO: usize = 32;
