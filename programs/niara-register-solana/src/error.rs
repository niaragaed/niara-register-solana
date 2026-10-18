use anchor_lang::prelude::*;

// Error messages stay in Portuguese: they are compiled into the deployed program.
// HashInvalido = invalid hash (all zeros); NomeInvalido = empty or too-long name;
// TipoInvalido = empty or too-long type.
#[error_code]
pub enum ErrorCode {
    #[msg("Hash invalido: o hash SHA-256 nao pode ser todo zero")]
    HashInvalido,
    #[msg("Nome do documento vazio ou acima do limite de bytes")]
    NomeInvalido,
    #[msg("Tipo do documento vazio ou acima do limite de bytes")]
    TipoInvalido,
}
