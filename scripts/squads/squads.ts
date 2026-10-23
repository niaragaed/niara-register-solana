// Command line for the Squads multisig that administers the Register program.
// Runbook: docs/admin-keys.md. Ledger members vote and execute with the
// official Squads CLI (`squads-multisig-cli ... --keypair usb://ledger`); this
// script creates the multisig, puts changes up for vote and shows their state.
//
//   npx ts-node scripts/squads/squads.ts <command>
//
// Environment:
//   RPC_URL         default https://api.devnet.solana.com
//   PAYER           keypair file that pays and signs (create: any; propose: a member with "p")
//   SQUADS_FILE     default squads.<cluster>.json (written by "create")
//
// Commands:
//   create           MEMBERS="KEY:ve,KEY:ve,KEY:ve,KEY:p" THRESHOLD=2 TIME_LOCK=86400
//   status           multisig, members, program upgrade authority, config admin, last proposals
//   propose-upgrade  BUFFER=<buffer whose authority is the vault> SPILL=<refund address>
//   propose-config   TREE=… COLLECTION=… BASE_URL=… (each defaults to the current value)
//   buffer-hash      BUFFER=…  SHA-256 and size of the code in a buffer: every voter compares
//                    them with the release .so (sha256sum) before approving an upgrade
//   approve          INDEX=n   (PAYER must be a voting member; for Ledger use the Squads CLI)
//   execute          INDEX=n   (PAYER must be an executing member; after the time lock)
import * as anchor from "@anchor-lang/core";
import * as multisig from "@sqds/multisig";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { createHash } from "crypto";
import { existsSync, readFileSync, writeFileSync } from "fs";
import idl from "../../idl/niara_register_solana.json";
import {
  REGISTER_PROGRAM_ID,
  adminState,
  approve,
  createSquad,
  describePermissions,
  execute,
  parseMembers,
  propose,
  proposalState,
  updateConfigInstruction,
  upgradeInstruction,
} from "./squads-lib";

type SquadsFile = {
  cluster: string;
  programId: string;
  multisig: string;
  vault: string;
  threshold: number;
  timeLockSeconds: number;
  members: { key: string; permissions: string }[];
  createdAt: string;
};

const rpcUrl = process.env.RPC_URL ?? "https://api.devnet.solana.com";
const cluster = rpcUrl.includes("devnet")
  ? "devnet"
  : rpcUrl.includes("mainnet")
  ? "mainnet"
  : "local";
const squadsFile = process.env.SQUADS_FILE ?? `squads.${cluster}.json`;
const connection = new Connection(rpcUrl, "confirmed");

const env = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`Set ${name}`);
  return v;
};
const keypair = (path: string) =>
  Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(path, "utf8")))
  );
const loadSquads = (): SquadsFile => {
  if (!existsSync(squadsFile))
    throw new Error(`${squadsFile} not found: run "create" first`);
  return JSON.parse(readFileSync(squadsFile, "utf8"));
};
const when = (unix: number) => new Date(unix * 1000).toISOString();

function registerProgram(payer: Keypair) {
  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(payer),
    {}
  );
  return new anchor.Program(idl as anchor.Idl, provider);
}

async function main() {
  const command = process.argv[2];

  if (command === "create") {
    if (existsSync(squadsFile))
      throw new Error(
        `${squadsFile} already exists; move it away to create another multisig`
      );
    const payer = keypair(env("PAYER"));
    const members = parseMembers(env("MEMBERS"));
    const threshold = Number(env("THRESHOLD"));
    const timeLockSeconds = Number(env("TIME_LOCK"));
    const { multisigPda, vaultPda, signature } = await createSquad(connection, {
      creator: payer,
      members,
      threshold,
      timeLockSeconds,
    });
    const out: SquadsFile = {
      cluster,
      programId: REGISTER_PROGRAM_ID.toBase58(),
      multisig: multisigPda.toBase58(),
      vault: vaultPda.toBase58(),
      threshold,
      timeLockSeconds,
      members: members.map((m) => ({
        key: m.key.toBase58(),
        permissions: describePermissions(m.permissions.mask),
      })),
      createdAt: new Date().toISOString(),
    };
    writeFileSync(squadsFile, JSON.stringify(out, null, 2) + "\n");
    console.log(JSON.stringify(out, null, 2));
    console.log(`\ncreated in ${signature}`);
    console.log(
      `\nThe program's new upgrade authority will be the VAULT: ${out.vault}`
    );
    return;
  }

  if (command === "buffer-hash") {
    const buffer = new PublicKey(env("BUFFER"));
    const info = await connection.getAccountInfo(buffer);
    if (!info) throw new Error("Buffer not found");
    // Buffer account: u32 tag, Option<Pubkey> authority (1 + 32), then the program bytes.
    const authority =
      info.data[4] === 1
        ? new PublicKey(info.data.subarray(5, 37)).toBase58()
        : "none";
    const code = info.data.subarray(37);
    console.log(`buffer     ${buffer.toBase58()}`);
    console.log(`authority  ${authority}`);
    console.log(`size       ${code.length} bytes`);
    console.log(
      `sha256     ${createHash("sha256").update(code).digest("hex")}`
    );
    return;
  }

  const squads = loadSquads();
  const multisigPda = new PublicKey(squads.multisig);
  const vault = new PublicKey(squads.vault);
  const programId = new PublicKey(squads.programId);

  if (command === "status") {
    const ms = await multisig.accounts.Multisig.fromAccountAddress(
      connection,
      multisigPda
    );
    const { upgradeAuthority, deploySlot } = await adminState(
      connection,
      programId
    );
    const program = registerProgram(Keypair.generate());
    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      programId
    );
    const config = await (program.account as any).config.fetchNullable(
      configPda
    );
    console.log(`multisig        ${multisigPda.toBase58()}`);
    console.log(`vault           ${vault.toBase58()}`);
    console.log(
      `threshold       ${ms.threshold} of ${
        ms.members.filter((m) => m.permissions.mask & 2).length
      } voters`
    );
    console.log(`time lock       ${ms.timeLock} s`);
    console.log(
      `config auth.    ${
        ms.configAuthority.equals(PublicKey.default)
          ? "none (changes need a vote)"
          : ms.configAuthority.toBase58()
      }`
    );
    for (const m of ms.members)
      console.log(
        `member          ${m.key.toBase58()}  ${describePermissions(
          m.permissions.mask
        )}`
      );
    console.log(
      `program         ${programId.toBase58()} (deployed in slot ${deploySlot})`
    );
    console.log(
      `upgrade auth.   ${upgradeAuthority?.toBase58() ?? "none (frozen)"} ${
        upgradeAuthority?.equals(vault) ? "= vault ✓" : "≠ vault"
      }`
    );
    if (config)
      console.log(
        `config admin    ${config.admin.toBase58()} ${
          config.admin.equals(vault)
            ? "= vault ✓"
            : "(update_config follows the upgrade authority)"
        }`
      );
    const last = BigInt(ms.transactionIndex.toString());
    for (let i = last; i > 0n && i > last - 5n; i--) {
      const p = await proposalState(connection, multisigPda, i);
      if (!p) continue;
      const ready =
        p.executableAt === null
          ? ""
          : p.executableAt * 1000 <= Date.now()
          ? " executable now"
          : ` executable at ${when(p.executableAt)}`;
      console.log(
        `proposal #${i}    ${p.status}, ${p.approvals.length} approval(s)${ready}`
      );
    }
    return;
  }

  const payer = keypair(env("PAYER"));

  if (command === "propose-upgrade") {
    const buffer = new PublicKey(env("BUFFER"));
    const spill = new PublicKey(env("SPILL"));
    const index = await propose(connection, {
      multisigPda,
      proposer: payer,
      instructions: [
        upgradeInstruction({ programId, buffer, spill, authority: vault }),
      ],
      memo: `upgrade ${programId.toBase58()} from buffer ${buffer.toBase58()}`,
    });
    console.log(`proposal #${index}: upgrade from buffer ${buffer.toBase58()}`);
    console.log(
      `Voters: check the code first with  BUFFER=${buffer.toBase58()} npx ts-node scripts/squads/squads.ts buffer-hash`
    );
    return;
  }

  if (command === "propose-config") {
    const program = registerProgram(payer);
    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      programId
    );
    const current = await (program.account as any).config.fetch(configPda);
    const merkleTree = new PublicKey(process.env.TREE ?? current.merkleTree);
    const coreCollection = new PublicKey(
      process.env.COLLECTION ?? current.coreCollection
    );
    const metadataBaseUrl = process.env.BASE_URL ?? current.metadataBaseUrl;
    const ix = await updateConfigInstruction(program, {
      vault,
      merkleTree,
      coreCollection,
      metadataBaseUrl,
    });
    const index = await propose(connection, {
      multisigPda,
      proposer: payer,
      instructions: [ix],
      memo: `update_config tree=${merkleTree.toBase58()} collection=${coreCollection.toBase58()} url=${metadataBaseUrl}`,
    });
    console.log(`proposal #${index}: update_config`);
    return;
  }

  if (command === "approve" || command === "execute") {
    const transactionIndex = BigInt(env("INDEX"));
    const sig =
      command === "approve"
        ? await approve(connection, {
            multisigPda,
            member: payer,
            transactionIndex,
          })
        : await execute(connection, {
            multisigPda,
            member: payer,
            transactionIndex,
          });
    console.log(`${command} #${transactionIndex}: ${sig}`);
    return;
  }

  throw new Error(`Unknown command "${command}". See the header of this file.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
