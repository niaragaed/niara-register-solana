import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { createHash, randomBytes } from "crypto";
import { assert } from "chai";
import { NiaraRegisterSolana } from "../target/types/niara_register_solana";

const SEED = Buffer.from("assinatura");

function sha256(conteudo: Buffer | string): number[] {
  return Array.from(createHash("sha256").update(conteudo).digest());
}

describe("niara-register (Solana)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace
    .niaraRegisterSolana as Program<NiaraRegisterSolana>;

  const pdaDe = (hash: number[]) =>
    anchor.web3.PublicKey.findProgramAddressSync(
      [SEED, Buffer.from(hash)],
      program.programId
    )[0];

  async function carteiraComSaldo() {
    const kp = anchor.web3.Keypair.generate();
    const sig = await provider.connection.requestAirdrop(
      kp.publicKey,
      anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig, "confirmed");
    return kp;
  }

  async function esperaErro(promessa: Promise<unknown>, trecho: string) {
    try {
      await promessa;
    } catch (e) {
      const texto = String(e) + JSON.stringify((e as any).logs ?? []);
      assert.include(texto, trecho);
      return;
    }
    assert.fail(`deveria ter falhado com ${trecho}`);
  }

  it("registra hash + assinante + timestamp + metadados e emite evento", async () => {
    const hash = sha256("Ata de reuniao de socios - " + Date.now());
    const assinatura = pdaDe(hash);

    let evento: any = null;
    const ouvinte = program.addEventListener("documentoRegistrado", (e) => {
      evento = e;
    });

    const antes = Math.floor(Date.now() / 1000);
    await program.methods
      .registrar(hash, "  Ata de reuniao de socios  ", "ata")
      .accounts({ assinante: provider.wallet.publicKey })
      .rpc({ commitment: "confirmed" });

    const conta = await program.account.assinatura.fetch(assinatura);
    assert.isTrue(conta.assinante.equals(provider.wallet.publicKey));
    assert.deepEqual(Array.from(conta.hashDocumento), hash);
    assert.equal(conta.nomeDocumento, "Ata de reuniao de socios"); // trim aplicado
    assert.equal(conta.tipoDocumento, "ata");
    assert.isAtLeast(conta.timestamp.toNumber(), antes - 120);
    assert.isAbove(conta.slot.toNumber(), 0);

    await new Promise((r) => setTimeout(r, 1500));
    await program.removeEventListener(ouvinte);
    assert.isNotNull(evento, "evento DocumentoRegistrado nao recebido");
    assert.deepEqual(Array.from(evento.hashDocumento), hash);
    assert.isTrue(evento.assinante.equals(provider.wallet.publicKey));
  });

  it("nao permite registrar o mesmo hash duas vezes (nem por outra carteira)", async () => {
    const hash = sha256(randomBytes(64));
    await program.methods
      .registrar(hash, "Contrato social", "contrato")
      .accounts({ assinante: provider.wallet.publicKey })
      .rpc();

    const outra = await carteiraComSaldo();
    await esperaErro(
      program.methods
        .registrar(hash, "Tentativa de re-datar", "contrato")
        .accounts({ assinante: outra.publicKey })
        .signers([outra])
        .rpc(),
      "already in use"
    );

    const conta = await program.account.assinatura.fetch(pdaDe(hash));
    assert.isTrue(conta.assinante.equals(provider.wallet.publicKey));
    assert.equal(conta.nomeDocumento, "Contrato social");
  });

  it("rejeita hash todo zero", async () => {
    await esperaErro(
      program.methods
        .registrar(new Array(32).fill(0), "Doc", "tipo")
        .accounts({ assinante: provider.wallet.publicKey })
        .rpc(),
      "HashInvalido"
    );
  });

  it("rejeita nome vazio ou acima de 128 bytes", async () => {
    await esperaErro(
      program.methods
        .registrar(sha256(randomBytes(32)), "   ", "ata")
        .accounts({ assinante: provider.wallet.publicKey })
        .rpc(),
      "NomeInvalido"
    );
    await esperaErro(
      program.methods
        .registrar(sha256(randomBytes(32)), "x".repeat(129), "ata")
        .accounts({ assinante: provider.wallet.publicKey })
        .rpc(),
      "NomeInvalido"
    );
  });

  it("aceita nome com exatamente 128 bytes (limite em bytes UTF-8)", async () => {
    const hash = sha256(randomBytes(32));
    // "ç" ocupa 2 bytes: 64 x "ç" = 128 bytes
    await program.methods
      .registrar(hash, "ç".repeat(64), "ata")
      .accounts({ assinante: provider.wallet.publicKey })
      .rpc();
    const conta = await program.account.assinatura.fetch(pdaDe(hash));
    assert.equal(conta.nomeDocumento, "ç".repeat(64));
  });

  it("rejeita tipo vazio ou acima de 32 bytes", async () => {
    await esperaErro(
      program.methods
        .registrar(sha256(randomBytes(32)), "Doc", "")
        .accounts({ assinante: provider.wallet.publicKey })
        .rpc(),
      "TipoInvalido"
    );
    await esperaErro(
      program.methods
        .registrar(sha256(randomBytes(32)), "Doc", "t".repeat(33))
        .accounts({ assinante: provider.wallet.publicKey })
        .rpc(),
      "TipoInvalido"
    );
  });

  it("quem assina paga o rent (sem custodia da Niara)", async () => {
    const assinante = await carteiraComSaldo();
    const antes = await provider.connection.getBalance(assinante.publicKey);
    const hash = sha256(randomBytes(32));
    await program.methods
      .registrar(hash, "Cap table v3", "cap table")
      .accounts({ assinante: assinante.publicKey })
      .signers([assinante])
      .rpc({ commitment: "confirmed" });
    const depois = await provider.connection.getBalance(
      assinante.publicKey,
      "confirmed"
    );
    const custo = (antes - depois) / anchor.web3.LAMPORTS_PER_SOL;
    console.log(`      custo por registro (rent + taxa): ${custo} SOL`);
    assert.isBelow(custo, 0.01);
    const conta = await program.account.assinatura.fetch(pdaDe(hash));
    assert.isTrue(conta.assinante.equals(assinante.publicKey));
  });
});
