use anchor_lang::prelude::*;

use crate::constants::*;

/// Prova de existência e autoria de um documento. Guarda só o hash SHA-256 —
/// o documento em si nunca vai para a blockchain (princípio "seu ativo, enfim
/// seu": o arquivo fica com o cliente).
///
/// Registro probatório complementar: NÃO substitui cartório nem ICP-Brasil.
#[account]
#[derive(InitSpace)]
pub struct Assinatura {
    /// Carteira (autocustódia) que assinou a transação de registro.
    pub assinante: Pubkey,
    /// Hash SHA-256 do documento, calculado no navegador do cliente.
    pub hash_documento: [u8; 32],
    /// Unix timestamp do cluster no momento do registro.
    pub timestamp: i64,
    /// Slot em que o registro entrou — âncora extra de ordenação temporal.
    pub slot: u64,
    #[max_len(MAX_NOME_DOCUMENTO)]
    pub nome_documento: String,
    #[max_len(MAX_TIPO_DOCUMENTO)]
    pub tipo_documento: String,
    pub bump: u8,
}

/// Mesmo formato lógico do evento `DocumentoRegistrado` do contrato EVM, para
/// o indexer do Niara-Register tratar as duas redes com o mesmo schema.
#[event]
pub struct DocumentoRegistrado {
    pub hash_documento: [u8; 32],
    pub assinante: Pubkey,
    pub nome_documento: String,
    pub tipo_documento: String,
    pub timestamp: i64,
    pub slot: u64,
}
