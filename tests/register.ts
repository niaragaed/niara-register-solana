import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { createHash, randomBytes } from "crypto";
import { assert } from "chai";
import { NiaraRegisterSolana } from "../target/types/niara_register_solana";

// PDA seed and instruction/account names ("assinatura", "registrar", "assinante")
// are part of the deployed program's interface and stay in Portuguese.
const SEED = Buffer.from("assinatura");

function sha256(content: Buffer | string): number[] {
  return Array.from(createHash("sha256").update(content).digest());
}

describe("niara-register (Solana)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace
    .niaraRegisterSolana as Program<NiaraRegisterSolana>;

  const pdaOf = (hash: number[]) =>
    anchor.web3.PublicKey.findProgramAddressSync(
      [SEED, Buffer.from(hash)],
      program.programId
    )[0];

  async function fundedWallet() {
    const kp = anchor.web3.Keypair.generate();
    const sig = await provider.connection.requestAirdrop(
      kp.publicKey,
      anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig, "confirmed");
    return kp;
  }

  async function expectError(promise: Promise<unknown>, fragment: string) {
    try {
      await promise;
    } catch (e) {
      const text = String(e) + JSON.stringify((e as any).logs ?? []);
      assert.include(text, fragment);
      return;
    }
    assert.fail(`should have failed with ${fragment}`);
  }

  it("records hash + signer + timestamp + metadata and emits an event", async () => {
    const hash = sha256("Partners' meeting minutes - " + Date.now());
    const record = pdaOf(hash);

    let event: any = null;
    const listener = program.addEventListener("documentoRegistrado", (e) => {
      event = e;
    });

    const before = Math.floor(Date.now() / 1000);
    await program.methods
      .registrar(hash, "  Partners' meeting minutes  ", "minutes")
      .accounts({ assinante: provider.wallet.publicKey })
      .rpc({ commitment: "confirmed" });

    const account = await program.account.assinatura.fetch(record);
    assert.isTrue(account.assinante.equals(provider.wallet.publicKey));
    assert.deepEqual(Array.from(account.hashDocumento), hash);
    assert.equal(account.nomeDocumento, "Partners' meeting minutes"); // trimmed
    assert.equal(account.tipoDocumento, "minutes");
    assert.isAtLeast(account.timestamp.toNumber(), before - 120);
    assert.isAbove(account.slot.toNumber(), 0);

    await new Promise((r) => setTimeout(r, 1500));
    await program.removeEventListener(listener);
    assert.isNotNull(event, "DocumentoRegistrado event not received");
    assert.deepEqual(Array.from(event.hashDocumento), hash);
    assert.isTrue(event.assinante.equals(provider.wallet.publicKey));
  });

  it("does not allow registering the same hash twice (not even from another wallet)", async () => {
    const hash = sha256(randomBytes(64));
    await program.methods
      .registrar(hash, "Articles of association", "contract")
      .accounts({ assinante: provider.wallet.publicKey })
      .rpc();

    const other = await fundedWallet();
    await expectError(
      program.methods
        .registrar(hash, "Back-dating attempt", "contract")
        .accounts({ assinante: other.publicKey })
        .signers([other])
        .rpc(),
      "already in use"
    );

    const account = await program.account.assinatura.fetch(pdaOf(hash));
    assert.isTrue(account.assinante.equals(provider.wallet.publicKey));
    assert.equal(account.nomeDocumento, "Articles of association");
  });

  it("rejects an all-zero hash", async () => {
    await expectError(
      program.methods
        .registrar(new Array(32).fill(0), "Doc", "type")
        .accounts({ assinante: provider.wallet.publicKey })
        .rpc(),
      "HashInvalido"
    );
  });

  it("rejects an empty name or one over 128 bytes", async () => {
    await expectError(
      program.methods
        .registrar(sha256(randomBytes(32)), "   ", "minutes")
        .accounts({ assinante: provider.wallet.publicKey })
        .rpc(),
      "NomeInvalido"
    );
    await expectError(
      program.methods
        .registrar(sha256(randomBytes(32)), "x".repeat(129), "minutes")
        .accounts({ assinante: provider.wallet.publicKey })
        .rpc(),
      "NomeInvalido"
    );
  });

  it("accepts a name of exactly 128 bytes (limit is in UTF-8 bytes)", async () => {
    const hash = sha256(randomBytes(32));
    // "ç" takes 2 bytes: 64 x "ç" = 128 bytes
    await program.methods
      .registrar(hash, "ç".repeat(64), "minutes")
      .accounts({ assinante: provider.wallet.publicKey })
      .rpc();
    const account = await program.account.assinatura.fetch(pdaOf(hash));
    assert.equal(account.nomeDocumento, "ç".repeat(64));
  });

  it("rejects an empty type or one over 32 bytes", async () => {
    await expectError(
      program.methods
        .registrar(sha256(randomBytes(32)), "Doc", "")
        .accounts({ assinante: provider.wallet.publicKey })
        .rpc(),
      "TipoInvalido"
    );
    await expectError(
      program.methods
        .registrar(sha256(randomBytes(32)), "Doc", "t".repeat(33))
        .accounts({ assinante: provider.wallet.publicKey })
        .rpc(),
      "TipoInvalido"
    );
  });

  it("the signer pays the rent (no Niara custody)", async () => {
    const signer = await fundedWallet();
    const before = await provider.connection.getBalance(signer.publicKey);
    const hash = sha256(randomBytes(32));
    await program.methods
      .registrar(hash, "Cap table v3", "cap table")
      .accounts({ assinante: signer.publicKey })
      .signers([signer])
      .rpc({ commitment: "confirmed" });
    const after = await provider.connection.getBalance(
      signer.publicKey,
      "confirmed"
    );
    const cost = (before - after) / anchor.web3.LAMPORTS_PER_SOL;
    console.log(`      cost per record (rent + fee): ${cost} SOL`);
    assert.isBelow(cost, 0.01);
    const account = await program.account.assinatura.fetch(pdaOf(hash));
    assert.isTrue(account.assinante.equals(signer.publicKey));
  });
});
