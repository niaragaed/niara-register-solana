use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Hash invalido: o hash SHA-256 nao pode ser todo zero")]
    HashInvalido,
    #[msg("Nome do documento vazio ou acima do limite de bytes")]
    NomeInvalido,
    #[msg("Tipo do documento vazio ou acima do limite de bytes")]
    TipoInvalido,
}
