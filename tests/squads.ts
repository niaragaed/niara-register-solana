// Rehearsal of the move to a Squads multisig (docs/admin-keys.md), on the
// local validator with the real Squads v4 program (dumped from devnet). Runs
// after tests/register.ts: it hands the program's upgrade authority to the
// vault, then upgrades the program and changes the config through votes.
import * as anchor from "@anchor-lang/core";
import { assert } from "chai";
import { execFileSync } from "child_process";
import {
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  adminState,
  approve,
  programDataAddress,
  createSquad,
  execute,
  parseMembers,
  propose,
  proposalState,
  setUpgradeAuthorityInstruction,
  updateConfigInstruction,
  upgradeInstruction,
} from "../scripts/squads/squads-lib";
import { configPda } from "../scripts/receipts-setup-lib";
import { NiaraRegisterSolana } from "../idl/niara_register_solana";

const TIME_LOCK = 3;

async function expectError(promise: Promise<unknown>, fragment: RegExp) {
  try {
    await promise;
  } catch (e) {
    const text = `${(e as Error).message} ${JSON.stringify(
      (e as { logs?: string[] }).logs ?? []
    )}`;
    assert.match(text, fragment);
    return;
  }
  assert.fail(`expected an error matching ${fragment}`);
}

describe("admin through a Squads multisig (rehearsal)", () => {
  const provider = anchor.AnchorProvider.env();
  const connection = provider.connection;
  const admin = (provider.wallet as anchor.Wallet).payer as Keypair;
  const program = anchor.workspace
    .niaraRegisterSolana as anchor.Program<NiaraRegisterSolana>;
  const programId = program.programId;
  // Three voters (the Ledgers, in real life) and a proposer-only hot key.
  const voters = [Keypair.generate(), Keypair.generate(), Keypair.generate()];
  const proposer = Keypair.generate();
  let multisigPda: PublicKey;
  let vault: PublicKey;

  const cli = (...args: string[]) =>
    execFileSync(
      "solana",
      [...args, "-u", "localhost", "-k", process.env.ANCHOR_WALLET!],
      { encoding: "utf8" }
    );
  const wait = (s: number) => new Promise((r) => setTimeout(r, s * 1000));

  before(async () => {
    for (const k of [...voters, proposer]) {
      const sig = await connection.requestAirdrop(
        k.publicKey,
        2 * anchor.web3.LAMPORTS_PER_SOL
      );
      await connection.confirmTransaction(sig, "confirmed");
    }
  });

  it("refuses a multisig where one key decides alone", async () => {
    const members = parseMembers(
      `${voters[0].publicKey.toBase58()}:pve,${proposer.publicKey.toBase58()}:p`
    );
    await expectError(
      createSquad(connection, {
        creator: admin,
        members,
        threshold: 1,
        timeLockSeconds: TIME_LOCK,
      }),
      /at least 2/
    );
  });

  it("creates a 2-of-3 multisig with a time lock and no config authority", async () => {
    const members = parseMembers(
      [
        ...voters.map(
          (v, i) => `${v.publicKey.toBase58()}:${i === 0 ? "ve" : "v"}`
        ),
        `${proposer.publicKey.toBase58()}:p`,
      ].join(",")
    );
    ({ multisigPda, vaultPda: vault } = await createSquad(connection, {
      creator: admin,
      members,
      threshold: 2,
      timeLockSeconds: TIME_LOCK,
    }));
    assert.ok(await connection.getAccountInfo(multisigPda));
  });

  it("hands the program's upgrade authority to the vault", async () => {
    await sendAndConfirmTransaction(
      connection,
      new Transaction().add(
        setUpgradeAuthorityInstruction({
          programId,
          current: admin.publicKey,
          next: vault,
        })
      ),
      [admin]
    );
    const { upgradeAuthority } = await adminState(connection, programId);
    assert.equal(upgradeAuthority?.toBase58(), vault.toBase58());
  });

  it("the old key can no longer change the config", async () => {
    const cfg = await program.account.config.fetch(configPda(programId));
    await expectError(
      (program.methods as any)
        .updateConfig(
          cfg.merkleTree,
          cfg.coreCollection,
          "https://evil.example/"
        )
        .accountsPartial({
          admin: admin.publicKey,
          programData: programDataAddress(programId),
        })
        .rpc(),
      /NotUpgradeAuthority/
    );
  });

  it("upgrades the program only after 2 approvals and the time lock", async () => {
    const before = await adminState(connection, programId);
    // Same flow as on devnet: write a buffer, give it to the vault, propose.
    const buffer = cli(
      "program",
      "write-buffer",
      "target/deploy/niara_register_solana.so",
      "--output",
      "json"
    );
    const bufferAddress = JSON.parse(buffer).buffer as string;
    cli(
      "program",
      "set-buffer-authority",
      bufferAddress,
      "--new-buffer-authority",
      vault.toBase58()
    );

    const index = await propose(connection, {
      multisigPda,
      proposer,
      instructions: [
        upgradeInstruction({
          programId,
          buffer: new PublicKey(bufferAddress),
          spill: admin.publicKey,
          authority: vault,
        }),
      ],
      memo: "rehearsal upgrade",
    });

    // The hot key can propose but never approve.
    await expectError(
      approve(connection, {
        multisigPda,
        member: proposer,
        transactionIndex: index,
      }),
      /Unauthorized|0x1773|6003/
    );
    await approve(connection, {
      multisigPda,
      member: voters[0],
      transactionIndex: index,
    });
    await expectError(
      execute(connection, {
        multisigPda,
        member: voters[0],
        transactionIndex: index,
      }),
      /InvalidProposalStatus|0x/
    );
    await approve(connection, {
      multisigPda,
      member: voters[1],
      transactionIndex: index,
    });
    await expectError(
      execute(connection, {
        multisigPda,
        member: voters[0],
        transactionIndex: index,
      }),
      /TimeLockNotReleased|0x/
    );
    // A voter without the execute permission cannot execute either.
    await wait(TIME_LOCK + 1);
    await expectError(
      execute(connection, {
        multisigPda,
        member: voters[1],
        transactionIndex: index,
      }),
      /Unauthorized|0x/
    );
    await execute(connection, {
      multisigPda,
      member: voters[0],
      transactionIndex: index,
    });

    const state = await proposalState(connection, multisigPda, index);
    assert.equal(state?.status, "Executed");
    const after = await adminState(connection, programId);
    assert.isAbove(after.deploySlot, before.deploySlot);
    assert.equal(after.upgradeAuthority?.toBase58(), vault.toBase58());
  });

  it("changes the config through a vote; the vault becomes the recorded admin", async () => {
    const cfg = await program.account.config.fetch(configPda(programId));
    const newUrl = "https://niara-register.vercel.app/api/receipts/solana/v2/";
    const ix = await updateConfigInstruction(program as anchor.Program<any>, {
      vault,
      merkleTree: cfg.merkleTree,
      coreCollection: cfg.coreCollection,
      metadataBaseUrl: newUrl,
    });
    const index = await propose(connection, {
      multisigPda,
      proposer,
      instructions: [ix],
      memo: "rehearsal config",
    });
    await approve(connection, {
      multisigPda,
      member: voters[1],
      transactionIndex: index,
    });
    await approve(connection, {
      multisigPda,
      member: voters[2],
      transactionIndex: index,
    });
    await wait(TIME_LOCK + 1);
    await execute(connection, {
      multisigPda,
      member: voters[0],
      transactionIndex: index,
    });
    const updated = await program.account.config.fetch(configPda(programId));
    assert.equal(updated.metadataBaseUrl, newUrl);
    assert.equal(updated.admin.toBase58(), vault.toBase58());
  });
});
