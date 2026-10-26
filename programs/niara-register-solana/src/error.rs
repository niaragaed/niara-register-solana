use anchor_lang::prelude::*;

// v1 error messages stay in Portuguese: they are compiled into the deployed
// program and existing clients match on them. HashInvalido = invalid hash
// (all zeros); NomeInvalido = empty or too-long name; TipoInvalido = empty or
// too-long type. New errors are in English and appended at the end so the
// v1 error codes do not move.
#[error_code]
pub enum ErrorCode {
    #[msg("Hash invalido: o hash SHA-256 nao pode ser todo zero")]
    HashInvalido,
    #[msg("Nome do documento vazio ou acima do limite de bytes")]
    NomeInvalido,
    #[msg("Tipo do documento vazio ou acima do limite de bytes")]
    TipoInvalido,

    #[msg("Unknown hash scheme")]
    UnknownScheme,
    #[msg("This hash already has a v1 record")]
    AlreadyRegisteredV1,
    #[msg("Only the program upgrade authority can do this")]
    NotUpgradeAuthority,
    #[msg("Metadata base URL is empty or too long")]
    InvalidBaseUrl,
    #[msg("Account does not match the configured one")]
    ConfigMismatch,
    #[msg("Could not read the tree config")]
    InvalidTreeConfig,
    #[msg("Invalid holder")]
    InvalidHolder,
    #[msg("Only the issuer can do this")]
    NotIssuer,
    #[msg("Only the person in control can do this")]
    NotController,
    #[msg("The record is not active")]
    NotActive,
    #[msg("The record has not been surrendered")]
    NotSurrendered,
    #[msg("There is no pending amendment")]
    NoPendingAmendment,
    #[msg("The pending amendment does not match")]
    AmendmentMismatch,
    #[msg("This document hash was already used")]
    HashAlreadyUsed,
    #[msg("Unknown termination reason")]
    UnknownTerminationReason,
    #[msg("Document type must not be 0")]
    InvalidDocumentType,
    #[msg("Commitment must not be all zeros")]
    InvalidCommitment,
    #[msg("The commitment must be revealed in a later slot")]
    RevealTooEarly,
    #[msg("The commitment expired; commit again")]
    CommitmentExpired,
    #[msg("This hash already has a v2 record")]
    AlreadyRegisteredV2,
    #[msg("ORB attestation is not enabled")]
    OrbDisabled,
    #[msg("Missing or invalid ORB attestation")]
    InvalidOrbAttestation,
    #[msg("Only the ORB attester or the program upgrade authority can do this")]
    NotOrbAuthority,
    #[msg("The commitment account does not match this signer, hash and nonce")]
    CommitmentMismatch,
}
