use anchor_lang::prelude::*;

/// Semente do PDA de cada registro: ["assinatura", hash_sha256].
/// Como o endereço do PDA é derivado do próprio hash, existe no máximo UMA
/// conta por documento — é isso que garante o "registro único" (paridade com
/// o `DocumentoJaRegistrado` do RegistroAssinaturas.sol na Sepolia).
#[constant]
pub const ASSINATURA_SEED: &[u8] = b"assinatura";

/// Limites em BYTES (UTF-8), não em caracteres. Mantêm o tamanho da conta
/// fixo e o custo de rent previsível. (Sem #[constant]: o IDL não serializa usize.)
pub const MAX_NOME_DOCUMENTO: usize = 128;

pub const MAX_TIPO_DOCUMENTO: usize = 32;
