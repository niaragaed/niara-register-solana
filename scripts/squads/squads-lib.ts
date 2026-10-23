// Squads v4 multisig as the admin of the Register program: helpers shared by
// scripts/squads/squads.ts (the command line) and tests/squads.ts (the local
// rehearsal). See docs/admin-keys.md for the runbook.
//
// The vault (index 0) of the multisig becomes the program's upgrade
// authority, and therefore also the only account that can call update_config.
// Every change then needs `threshold` member approvals and waits `timeLock`
// seconds after approval before anyone can execute it.
import * as anchor from "@anchor-lang/core";
import * as multisig from "@sqds/multisig";
import {
  Connection,
  Keypair,
  PublicKey,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  Signer,
  TransactionInstruction,
  TransactionMessage,
} from "@solana/web3.js";

export const LOADER = new PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111"
);
export const REGISTER_PROGRAM_ID = new PublicKey(
  "9RPHqLouFjoUbPdcmA1GyHMeDoWvjZMuCyYFPBWLmTcR"
);
const { Permission, Permissions } = multisig.types;

export const programDataAddress = (programId: PublicKey) =>
  PublicKey.findProgramAddressSync([programId.toBuffer()], LOADER)[0];

/**
 * "PUBKEY:pve,PUBKEY:p" -> members. p = propose (Initiate), v = vote,
 * e = execute. A proposer-only key can put a change up for vote but can
 * never approve it, so it can live on a computer.
 */
export function parseMembers(spec: string): multisig.types.Member[] {
  return spec
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [key, flags = "pve"] = entry.split(":");
      const perms: multisig.types.Permission[] = [];
      if (flags.includes("p")) perms.push(Permission.Initiate);
      if (flags.includes("v")) perms.push(Permission.Vote);
      if (flags.includes("e")) perms.push(Permission.Execute);
      if (perms.length === 0) throw new Error(`No permissions for ${key}`);
      return {
        key: new PublicKey(key),
        permissions: Permissions.fromPermissions(perms),
      };
    });
}

export function describePermissions(mask: number): string {
  return [
    mask & 1 ? "propose" : "",
    mask & 2 ? "vote" : "",
    mask & 4 ? "execute" : "",
  ]
    .filter(Boolean)
    .join("+");
}

export async function createSquad(
  connection: Connection,
  opts: {
    creator: Signer;
    members: multisig.types.Member[];
    threshold: number;
    timeLockSeconds: number;
  }
) {
  const voters = opts.members.filter(
    (m) => (m.permissions.mask & 2) !== 0
  ).length;
  if (opts.threshold < 2)
    throw new Error(
      "Use a threshold of at least 2: one key alone must not decide."
    );
  if (opts.threshold > voters)
    throw new Error(
      `Threshold ${opts.threshold} is above the ${voters} voting members.`
    );
  if (!opts.members.some((m) => (m.permissions.mask & 4) !== 0))
    throw new Error("At least one member must be able to execute.");

  const createKey = Keypair.generate();
  const [multisigPda] = multisig.getMultisigPda({
    createKey: createKey.publicKey,
  });
  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 });
  const programConfig =
    await multisig.accounts.ProgramConfig.fromAccountAddress(
      connection,
      multisig.getProgramConfigPda({})[0]
    );
  const signature = await multisig.rpc.multisigCreateV2({
    connection,
    treasury: programConfig.treasury,
    createKey,
    creator: opts.creator as Keypair,
    multisigPda,
    // No config authority: changing members, threshold or time lock also
    // needs a vote (and waits the time lock).
    configAuthority: null,
    threshold: opts.threshold,
    members: opts.members,
    timeLock: opts.timeLockSeconds,
    rentCollector: null,
    sendOptions: { skipPreflight: false },
  });
  await connection.confirmTransaction(signature, "confirmed");
  return { multisigPda, vaultPda, signature };
}

/** BPF upgradeable loader Upgrade (instruction 3), signed by the vault. */
export function upgradeInstruction(opts: {
  programId: PublicKey;
  buffer: PublicKey;
  spill: PublicKey;
  authority: PublicKey;
}) {
  return new TransactionInstruction({
    programId: LOADER,
    keys: [
      {
        pubkey: programDataAddress(opts.programId),
        isSigner: false,
        isWritable: true,
      },
      { pubkey: opts.programId, isSigner: false, isWritable: true },
      { pubkey: opts.buffer, isSigner: false, isWritable: true },
      { pubkey: opts.spill, isSigner: false, isWritable: true },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: opts.authority, isSigner: true, isWritable: false },
    ],
    data: Buffer.from([3, 0, 0, 0]),
  });
}

/** BPF upgradeable loader SetAuthority (instruction 4) for a program. */
export function setUpgradeAuthorityInstruction(opts: {
  programId: PublicKey;
  current: PublicKey;
  next: PublicKey;
}) {
  return new TransactionInstruction({
    programId: LOADER,
    keys: [
      {
        pubkey: programDataAddress(opts.programId),
        isSigner: false,
        isWritable: true,
      },
      { pubkey: opts.current, isSigner: true, isWritable: false },
      { pubkey: opts.next, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([4, 0, 0, 0]),
  });
}

/** update_config of the Register program, with the vault as admin. */
export async function updateConfigInstruction(
  program: anchor.Program<any>,
  opts: {
    vault: PublicKey;
    merkleTree: PublicKey;
    coreCollection: PublicKey;
    metadataBaseUrl: string;
  }
) {
  return (program.methods as any)
    .updateConfig(opts.merkleTree, opts.coreCollection, opts.metadataBaseUrl)
    .accountsPartial({
      admin: opts.vault,
      programData: programDataAddress(program.programId),
    })
    .instruction() as Promise<TransactionInstruction>;
}

/** Puts instructions up for vote as one vault transaction; returns its index. */
export async function propose(
  connection: Connection,
  opts: {
    multisigPda: PublicKey;
    proposer: Signer;
    instructions: TransactionInstruction[];
    memo: string;
  }
): Promise<bigint> {
  const ms = await multisig.accounts.Multisig.fromAccountAddress(
    connection,
    opts.multisigPda
  );
  const transactionIndex = BigInt(ms.transactionIndex.toString()) + 1n;
  const [vaultPda] = multisig.getVaultPda({
    multisigPda: opts.multisigPda,
    index: 0,
  });
  const { blockhash } = await connection.getLatestBlockhash("finalized");
  const message = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: blockhash,
    instructions: opts.instructions,
  });
  const createSig = await multisig.rpc.vaultTransactionCreate({
    connection,
    feePayer: opts.proposer,
    multisigPda: opts.multisigPda,
    transactionIndex,
    creator: opts.proposer.publicKey,
    vaultIndex: 0,
    ephemeralSigners: 0,
    transactionMessage: message,
    memo: opts.memo,
  });
  await connection.confirmTransaction(createSig, "confirmed");
  const proposalSig = await multisig.rpc.proposalCreate({
    connection,
    feePayer: opts.proposer,
    creator: opts.proposer,
    multisigPda: opts.multisigPda,
    transactionIndex,
  });
  await connection.confirmTransaction(proposalSig, "confirmed");
  return transactionIndex;
}

export async function approve(
  connection: Connection,
  opts: { multisigPda: PublicKey; member: Signer; transactionIndex: bigint }
) {
  const sig = await multisig.rpc.proposalApprove({
    connection,
    feePayer: opts.member,
    member: opts.member,
    multisigPda: opts.multisigPda,
    transactionIndex: opts.transactionIndex,
  });
  await connection.confirmTransaction(sig, "confirmed");
  return sig;
}

export async function execute(
  connection: Connection,
  opts: { multisigPda: PublicKey; member: Signer; transactionIndex: bigint }
) {
  const sig = await multisig.rpc.vaultTransactionExecute({
    connection,
    feePayer: opts.member,
    multisigPda: opts.multisigPda,
    transactionIndex: opts.transactionIndex,
    member: opts.member.publicKey,
  });
  await connection.confirmTransaction(sig, "confirmed");
  return sig;
}

export type ProposalState = {
  index: bigint;
  status: string;
  approvals: string[];
  /** Unix seconds when it can be executed (approved + time lock), if approved. */
  executableAt: number | null;
};

export async function proposalState(
  connection: Connection,
  multisigPda: PublicKey,
  index: bigint
): Promise<ProposalState | null> {
  const [proposalPda] = multisig.getProposalPda({
    multisigPda,
    transactionIndex: index,
  });
  const info = await connection.getAccountInfo(proposalPda);
  if (!info) return null;
  const [proposal] = multisig.accounts.Proposal.fromAccountInfo(info);
  const ms = await multisig.accounts.Multisig.fromAccountAddress(
    connection,
    multisigPda
  );
  const status = proposal.status as {
    __kind: string;
    timestamp?: { toString(): string };
  };
  const approvedAt =
    status.__kind === "Approved" && status.timestamp
      ? Number(status.timestamp.toString())
      : null;
  return {
    index,
    status: status.__kind,
    approvals: proposal.approved.map((k) => k.toBase58()),
    executableAt: approvedAt === null ? null : approvedAt + ms.timeLock,
  };
}

/** Who can upgrade the program and change its config, as the chain says. */
export async function adminState(connection: Connection, programId: PublicKey) {
  const info = await connection.getAccountInfo(programDataAddress(programId));
  if (!info) throw new Error("Program data account not found");
  // ProgramData: u32 tag, u64 slot, Option<Pubkey> authority.
  const hasAuthority = info.data[12] === 1;
  const upgradeAuthority = hasAuthority
    ? new PublicKey(info.data.subarray(13, 45))
    : null;
  const deploySlot = Number(info.data.readBigUInt64LE(4));
  return { upgradeAuthority, deploySlot };
}
