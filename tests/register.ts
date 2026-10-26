import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { createHash, randomBytes } from "crypto";
import { assert } from "chai";
import { Keypair, PublicKey } from "@solana/web3.js";
import { publicKey as umiPublicKey } from "@metaplex-foundation/umi";
import {
  getMerkleProof,
  getMerkleRoot,
  hashLeafV2,
  transferV2,
  TokenStandard,
} from "@metaplex-foundation/mpl-bubblegum";
import { fetchCollection } from "@metaplex-foundation/mpl-core";
import {
  fetchMerkleTree,
  getCurrentRoot,
} from "@metaplex-foundation/mpl-account-compression";
// Committed types (idl/), so the tests type-check without an anchor build.
import { NiaraRegisterSolana } from "../idl/niara_register_solana";
import {
  configPda,
  createReceiptInfrastructure,
  umiFor,
  writeConfig,
} from "../scripts/receipts-setup-lib";

const BUBBLEGUM = new PublicKey("BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY");
const BASE_URL = "https://niara-register.vercel.app/api/receipts/solana/";
const MAX_DEPTH = 14;

function sha256(...parts: (Buffer | string)[]): Buffer {
  const h = createHash("sha256");
  for (const p of parts) h.update(p);
  return h.digest();
}
const arr = (b: Buffer) => Array.from(b);
const ZERO32 = new Array(32).fill(0);
const NONCE = Buffer.alloc(32, 7);

async function expectError(promise: Promise<unknown>, fragment: string) {
  try {
    await promise;
  } catch (e) {
    const text =
      String(e) +
      JSON.stringify((e as any).logs ?? (e as any).transactionLogs ?? []);
    assert.include(text, fragment);
    return;
  }
  assert.fail(`should have failed with ${fragment}`);
}

describe("niara-register v3 (Solana)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace
    .niaraRegisterSolana as Program<NiaraRegisterSolana>;
  const admin = (provider.wallet as anchor.Wallet).payer as Keypair;
  const umi = umiFor(provider.connection.rpcEndpoint, admin);

  let merkleTree: PublicKey;
  let coreCollection: PublicKey;
  let receiptAuthority: PublicKey;

  const LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
  const programDataPda = () =>
    PublicKey.findProgramAddressSync([program.programId.toBuffer()], LOADER)[0];

  /** BPF upgradeable loader SetAuthority (instruction 4) on this program. */
  async function setUpgradeAuthority(current: Keypair, next: PublicKey) {
    const ix = new anchor.web3.TransactionInstruction({
      programId: LOADER,
      keys: [
        { pubkey: programDataPda(), isSigner: false, isWritable: true },
        { pubkey: current.publicKey, isSigner: true, isWritable: false },
        { pubkey: next, isSigner: false, isWritable: false },
      ],
      data: Buffer.from([4, 0, 0, 0]),
    });
    await anchor.web3.sendAndConfirmTransaction(
      provider.connection,
      new anchor.web3.Transaction().add(ix),
      [current]
    );
  }

  async function fundedWallet() {
    const kp = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(
      kp.publicKey,
      anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig, "confirmed");
    return kp;
  }

  const recordPda = (hash: Buffer) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("record_v3"), hash],
      program.programId
    )[0];

  const treeConfigPda = () =>
    PublicKey.findProgramAddressSync([merkleTree.toBuffer()], BUBBLEGUM)[0];
  const orbConfigPda = () =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("orb_config")],
      program.programId
    )[0];

  /** Same recipe as the program and the site's lib/commit-reveal.ts. */
  const commitmentOf = (signer: PublicKey, hash: Buffer, nonce: Buffer) =>
    sha256(
      "niara-commit-v1",
      program.programId.toBuffer(),
      signer.toBuffer(),
      hash,
      nonce
    );
  const commitmentPda = (signer: PublicKey, c: Buffer) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("commitment"), signer.toBuffer(), c],
      program.programId
    )[0];
  const orbMessage = (hash: Buffer, report: Buffer, signer: PublicKey) =>
    sha256(
      Buffer.from("niara-orb-v1"),
      program.programId.toBuffer(),
      hash,
      report,
      signer.toBuffer()
    );

  const commitIx = (signer: PublicKey, c: Buffer) =>
    program.methods
      .commit(arr(c))
      .accountsPartial({ signer, pending: commitmentPda(signer, c) })
      .instruction();

  async function commit(signer: Keypair, hash: Buffer, nonce: Buffer) {
    const c = commitmentOf(signer.publicKey, hash, nonce);
    const sig = await program.methods
      .commit(arr(c))
      .accountsPartial({
        signer: signer.publicKey,
        pending: commitmentPda(signer.publicKey, c),
      })
      .signers([signer])
      .rpc();
    await provider.connection.confirmTransaction(sig, "confirmed");
    return c;
  }

  type RevealOpts = {
    nonce?: Buffer;
    /** Commitment account to pass (default: the signer's own for this hash/nonce). */
    commitment?: PublicKey;
    orb?: { report: Buffer; preIx?: anchor.web3.TransactionInstruction };
  };

  function revealBuilder(
    signer: Keypair,
    hash: Buffer,
    scheme: number,
    meta: number[],
    docType: number,
    o: RevealOpts
  ) {
    const nonce = o.nonce ?? NONCE;
    return (
      program.methods
        .registerV3(
          arr(hash),
          scheme,
          docType,
          meta,
          arr(nonce),
          o.orb ? arr(o.orb.report) : ZERO32
        )
        .accountsPartial({
          signer: signer.publicKey,
          commitment:
            o.commitment ??
            commitmentPda(
              signer.publicKey,
              commitmentOf(signer.publicKey, hash, nonce)
            ),
          orbConfig: o.orb ? orbConfigPda() : null,
          merkleTree,
          coreCollection,
        })
        // Same compute budget as the site; the Ed25519 attestation must come
        // right before register_v3, so it goes last.
        .preInstructions([
          anchor.web3.ComputeBudgetProgram.setComputeUnitLimit({
            units: 400_000,
          }),
          ...(o.orb?.preIx ? [o.orb.preIx] : []),
        ])
        .signers([signer])
    );
  }

  // Waits for "confirmed": the Metaplex (umi) reads below use that commitment,
  // and Anchor's rpc() returns as soon as the transaction is "processed".
  async function reveal(
    signer: Keypair,
    hash: Buffer,
    scheme: number,
    meta: number[],
    docType = 1,
    o: RevealOpts = {}
  ) {
    const sig = await revealBuilder(
      signer,
      hash,
      scheme,
      meta,
      docType,
      o
    ).rpc();
    await provider.connection.confirmTransaction(sig, "confirmed");
    return sig;
  }

  /** Commit, wait for a later slot, reveal. */
  async function registerV3(
    signer: Keypair,
    hash: Buffer,
    scheme: number,
    meta: number[],
    docType = 1,
    o: RevealOpts = {}
  ) {
    await commit(signer, hash, o.nonce ?? NONCE);
    await nextSlot();
    return reveal(signer, hash, scheme, meta, docType, o);
  }

  async function nextSlot() {
    const start = await provider.connection.getSlot("confirmed");
    while ((await provider.connection.getSlot("confirmed")) <= start)
      await new Promise((r) => setTimeout(r, 100));
  }

  before(async () => {
    const infra = await createReceiptInfrastructure({
      umi,
      programId: program.programId,
      collectionName: "Niara Register receipts (test)",
      collectionUri: `${BASE_URL}collection`,
      maxDepth: MAX_DEPTH,
    });
    merkleTree = infra.merkleTree;
    coreCollection = infra.coreCollection;
    receiptAuthority = infra.receiptAuthority;
    await writeConfig({
      program: program as any,
      admin: admin.publicKey,
      merkleTree,
      coreCollection,
      metadataBaseUrl: BASE_URL,
    });
  });

  describe("receipt infrastructure", () => {
    it("collection is frozen by a permanent freeze delegate held by the program", async () => {
      const collection = await fetchCollection(
        umi,
        umiPublicKey(coreCollection.toBase58())
      );
      assert.equal(
        collection.updateAuthority.toString(),
        receiptAuthority.toBase58()
      );
      assert.isTrue(collection.permanentFreezeDelegate?.frozen);
      assert.equal(
        (
          collection.permanentFreezeDelegate?.authority as any
        ).address.toString(),
        receiptAuthority.toBase58()
      );
      assert.isDefined(collection.bubblegumV2);
    });

    it("only the upgrade authority can update the config", async () => {
      const intruder = await fundedWallet();
      await expectError(
        program.methods
          .updateConfig(merkleTree, coreCollection, "https://evil.example/")
          .accountsPartial({
            admin: intruder.publicKey,
            programData: programDataPda(),
          })
          .signers([intruder])
          .rpc(),
        "NotUpgradeAuthority"
      );
    });

    it("update_config follows the upgrade authority when it moves (e.g. to a multisig)", async () => {
      const newAuthority = await fundedWallet();
      await setUpgradeAuthority(admin, newAuthority.publicKey);
      try {
        // The account that initialized the config has no say any more.
        await expectError(
          program.methods
            .updateConfig(merkleTree, coreCollection, BASE_URL)
            .accountsPartial({
              admin: admin.publicKey,
              programData: programDataPda(),
            })
            .rpc(),
          "NotUpgradeAuthority"
        );
        await program.methods
          .updateConfig(merkleTree, coreCollection, BASE_URL)
          .accountsPartial({
            admin: newAuthority.publicKey,
            programData: programDataPda(),
          })
          .signers([newAuthority])
          .rpc();
        const cfg = await program.account.config.fetch(
          configPda(program.programId)
        );
        assert.equal(cfg.admin.toBase58(), newAuthority.publicKey.toBase58());
      } finally {
        await setUpgradeAuthority(newAuthority, admin.publicKey);
        await program.methods
          .updateConfig(merkleTree, coreCollection, BASE_URL)
          .accountsPartial({
            admin: admin.publicKey,
            programData: programDataPda(),
          })
          .rpc();
      }
    });

    it("initialize_config cannot run twice", async () => {
      const programData = PublicKey.findProgramAddressSync(
        [program.programId.toBuffer()],
        new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
      )[0];
      await expectError(
        program.methods
          .initializeConfig(merkleTree, coreCollection, BASE_URL)
          .accountsPartial({ admin: admin.publicKey, programData })
          .rpc(),
        "already in use"
      );
    });
  });

  describe("register_v3 (commit-reveal)", () => {
    it("stores no readable metadata and mints a receipt leaf owned by the signer", async () => {
      const signer = await fundedWallet();
      const fileHash = sha256("signed pdf " + Date.now());
      const salt = randomBytes(32);
      const meta = sha256(
        "niara-meta-v1",
        salt,
        '{"name":"Lease","type":"contract"}'
      );

      await registerV3(signer, fileHash, 0, arr(meta));

      const rec = await program.account.recordV3.fetch(recordPda(fileHash));
      assert.equal(rec.signer.toBase58(), signer.publicKey.toBase58());
      assert.deepEqual(Buffer.from(rec.recordHash), fileHash);
      assert.equal(rec.scheme, 0);
      assert.equal(rec.documentType, 1);
      assert.deepEqual(Buffer.from(rec.metadataCommitment), meta);
      assert.deepEqual(rec.orbReportHash, ZERO32);
      assert.equal(rec.receiptTree.toBase58(), merkleTree.toBase58());
      assert.equal(rec.receiptNonce.toNumber(), 0);
      const assetId = PublicKey.findProgramAddressSync(
        [Buffer.from("asset"), merkleTree.toBuffer(), Buffer.alloc(8)],
        BUBBLEGUM
      )[0];
      assert.equal(rec.receiptAssetId.toBase58(), assetId.toBase58());

      // Rebuild the expected leaf and compare with the tree's on-chain root:
      // proves the receipt exists, belongs to the signer, carries our
      // metadata and sits in our collection.
      const metadata = {
        name: "Niara Register receipt",
        symbol: "NIARA-R",
        uri: BASE_URL + fileHash.toString("hex"),
        sellerFeeBasisPoints: 0,
        primarySaleHappened: false,
        isMutable: false,
        tokenStandard: TokenStandard.NonFungible,
        creators: [],
        collection: umiPublicKey(coreCollection.toBase58()),
      };
      const owner = umiPublicKey(signer.publicKey.toBase58());
      const leaf = umiPublicKey(
        hashLeafV2(umi, {
          merkleTree: umiPublicKey(merkleTree.toBase58()),
          owner,
          leafIndex: 0,
          metadata,
        })
      );
      const tree = await fetchMerkleTree(
        umi,
        umiPublicKey(merkleTree.toBase58())
      );
      const onChainRoot = Buffer.from(getCurrentRoot(tree.tree)).toString(
        "hex"
      );
      const expectedRoot = Buffer.from(
        umiPublicKeyBytes(getMerkleRoot([leaf], MAX_DEPTH))
      ).toString("hex");
      assert.equal(onChainRoot, expectedRoot);

      // The receipt is soulbound: even its owner, with a valid proof, cannot move it.
      const ownerUmi = umiFor(provider.connection.rpcEndpoint, signer);
      const { hashMetadataDataV2, hashMetadataCreators } = await import(
        "@metaplex-foundation/mpl-bubblegum"
      );
      await expectError(
        transferV2(ownerUmi, {
          leafOwner: owner,
          newLeafOwner: umiPublicKey(Keypair.generate().publicKey.toBase58()),
          merkleTree: umiPublicKey(merkleTree.toBase58()),
          coreCollection: umiPublicKey(coreCollection.toBase58()),
          root: Buffer.from(expectedRoot, "hex"),
          dataHash: hashMetadataDataV2(metadata),
          creatorHash: hashMetadataCreators([]),
          nonce: 0,
          index: 0,
          proof: getMerkleProof([leaf], MAX_DEPTH, leaf),
        }).sendAndConfirm(ownerUmi),
        "CollectionIsFrozen"
      );
    });

    it("emits DocumentRegisteredV3", async () => {
      const signer = await fundedWallet();
      const hash = sha256(
        "niara-record-v1",
        randomBytes(32),
        sha256("file " + Date.now())
      );
      let event: any = null;
      const listener = program.addEventListener("documentRegisteredV3", (e) => {
        event = e;
      });
      await registerV3(signer, hash, 1, ZERO32, 9);
      for (let i = 0; i < 20 && !event; i++)
        await new Promise((r) => setTimeout(r, 200));
      await program.removeEventListener(listener);
      assert.isNotNull(event);
      assert.deepEqual(Buffer.from(event.recordHash), hash);
      assert.equal(event.signer.toBase58(), signer.publicKey.toBase58());
      assert.equal(event.scheme, 1);
      assert.equal(event.documentType, 9);
      assert.deepEqual(event.metadataCommitment, ZERO32);
      assert.deepEqual(event.orbReportHash, ZERO32);
    });

    it("one record per hash, whoever signs", async () => {
      const a = await fundedWallet();
      const b = await fundedWallet();
      const hash = sha256("dup " + Date.now());
      await registerV3(a, hash, 0, ZERO32);
      await expectError(registerV3(b, hash, 1, ZERO32), "already in use");
    });

    it("rejects a zero hash, unknown schemes and document type 0", async () => {
      const a = await fundedWallet();
      await expectError(
        registerV3(a, Buffer.alloc(32), 0, ZERO32),
        "HashInvalido"
      );
      await expectError(
        registerV3(a, sha256("s " + Date.now()), 2, ZERO32),
        "UnknownScheme"
      );
      await expectError(
        registerV3(a, sha256("t " + Date.now()), 0, ZERO32, 0),
        "InvalidDocumentType"
      );
    });

    it("rejects a tree or collection other than the configured ones", async () => {
      const a = await fundedWallet();
      const hash = sha256("x " + Date.now());
      await commit(a, hash, NONCE);
      await expectError(
        revealBuilder(a, hash, 0, ZERO32, 1, {})
          .accountsPartial({ merkleTree: Keypair.generate().publicKey })
          .rpc(),
        "ConfigMismatch"
      );
    });

    it("tree mint count advances with each receipt", async () => {
      const before = (await provider.connection.getAccountInfo(
        treeConfigPda()
      ))!.data;
      const a = await fundedWallet();
      await registerV3(a, sha256("count " + Date.now()), 0, ZERO32);
      const after = (await provider.connection.getAccountInfo(treeConfigPda()))!
        .data;
      // TreeConfig: 8 disc + 32 creator + 32 delegate + 8 capacity + 8 num_minted
      assert.equal(after.readBigUInt64LE(80), before.readBigUInt64LE(80) + 1n);
    });

    it("reveal without a commitment fails", async () => {
      const a = await fundedWallet();
      await expectError(
        reveal(a, sha256("nocommit " + Date.now()), 0, ZERO32),
        "AccountNotInitialized"
      );
    });

    it("reveal in the same slot as the commit fails", async () => {
      const a = await fundedWallet();
      const hash = sha256("sameslot " + Date.now());
      const c = commitmentOf(a.publicKey, hash, NONCE);
      await expectError(
        revealBuilder(a, hash, 0, ZERO32, 1, {})
          .preInstructions([await commitIx(a.publicKey, c)])
          .rpc(),
        "RevealTooEarly"
      );
    });

    it("a commitment for another hash cannot be used", async () => {
      const a = await fundedWallet();
      const hash = sha256("swap " + Date.now());
      const other = sha256("swap-other " + Date.now());
      const c = await commit(a, other, NONCE);
      await nextSlot();
      await expectError(
        reveal(a, hash, 0, ZERO32, 1, {
          commitment: commitmentPda(a.publicKey, c),
        }),
        "CommitmentMismatch"
      );
    });

    it("a wrong nonce points at a commitment that does not exist", async () => {
      const a = await fundedWallet();
      const hash = sha256("nonce " + Date.now());
      await commit(a, hash, NONCE);
      await nextSlot();
      await expectError(
        reveal(a, hash, 0, ZERO32, 1, { nonce: Buffer.alloc(32, 9) }),
        "AccountNotInitialized"
      );
    });

    it("front-runner copying the reveal fails: no commitment of their own", async () => {
      const alice = await fundedWallet();
      const bob = await fundedWallet();
      const hash = sha256("frontrun " + Date.now());
      const c = await commit(alice, hash, NONCE);
      await nextSlot();
      // Same arguments; Bob's own commitment address does not exist...
      await expectError(reveal(bob, hash, 0, ZERO32), "AccountNotInitialized");
      // ...and Alice's commitment account is bound to her (has_one + address check).
      await expectError(
        reveal(bob, hash, 0, ZERO32, 1, {
          commitment: commitmentPda(alice.publicKey, c),
        }),
        "ConstraintHasOne"
      );
      await reveal(alice, hash, 0, ZERO32);
      const rec = await program.account.recordV3.fetch(recordPda(hash));
      assert.equal(rec.signer.toBase58(), alice.publicKey.toBase58());
    });

    it("the commitment is closed on reveal (rent back) and cannot be reset while live", async () => {
      const a = await fundedWallet();
      const hash = sha256("close " + Date.now());
      const c = await commit(a, hash, NONCE);
      await expectError(commit(a, hash, NONCE), "already in use");
      await nextSlot();
      await reveal(a, hash, 0, ZERO32);
      assert.isNull(
        await provider.connection.getAccountInfo(commitmentPda(a.publicKey, c))
      );
    });

    it("cancel_commitment closes a pending commitment", async () => {
      const a = await fundedWallet();
      const hash = sha256("cancel " + Date.now());
      const c = await commit(a, hash, NONCE);
      await program.methods
        .cancelCommitment(arr(c))
        .accountsPartial({
          signer: a.publicKey,
          pending: commitmentPda(a.publicKey, c),
        })
        .signers([a])
        .rpc();
      assert.isNull(
        await provider.connection.getAccountInfo(
          commitmentPda(a.publicKey, c),
          "processed"
        )
      );
    });
  });

  describe("ORB attestation", () => {
    const attester = Keypair.generate();
    const REPORT = sha256("orb report " + Date.now());
    const edIx = (key: Keypair, msg: Buffer) =>
      anchor.web3.Ed25519Program.createInstructionWithPrivateKey({
        privateKey: key.secretKey,
        message: msg,
      });

    it("is off until the ORB config exists", async () => {
      const a = await fundedWallet();
      const hash = sha256("orb-off " + Date.now());
      await commit(a, hash, NONCE);
      await nextSlot();
      await expectError(
        revealBuilder(a, hash, 0, ZERO32, 1, {
          orb: {
            report: REPORT,
            preIx: edIx(attester, orbMessage(hash, REPORT, a.publicKey)),
          },
        })
          .accountsPartial({ orbConfig: null })
          .rpc(),
        "OrbDisabled"
      );
    });

    it("only the upgrade authority creates the ORB config", async () => {
      const intruder = await fundedWallet();
      await expectError(
        program.methods
          .initializeOrbConfig(attester.publicKey)
          .accountsPartial({
            admin: intruder.publicKey,
            programData: programDataPda(),
          })
          .signers([intruder])
          .rpc(),
        "NotUpgradeAuthority"
      );
      await program.methods
        .initializeOrbConfig(attester.publicKey)
        .accountsPartial({
          admin: admin.publicKey,
          programData: programDataPda(),
        })
        .rpc();
      const cfg = await program.account.orbConfig.fetch(orbConfigPda());
      assert.equal(cfg.attester.toBase58(), attester.publicKey.toBase58());
    });

    it("records the report hash with a valid attestation", async () => {
      const a = await fundedWallet();
      const hash = sha256("orb-ok " + Date.now());
      await registerV3(a, hash, 0, ZERO32, 1, {
        orb: {
          report: REPORT,
          preIx: edIx(attester, orbMessage(hash, REPORT, a.publicKey)),
        },
      });
      const rec = await program.account.recordV3.fetch(recordPda(hash));
      assert.deepEqual(Buffer.from(rec.orbReportHash), REPORT);
    });

    it("cannot be self-claimed: missing, wrong key, other signer, other record or other report", async () => {
      const a = await fundedWallet();
      const b = await fundedWallet();
      const hash = sha256("orb-bad " + Date.now());
      await commit(a, hash, NONCE);
      await nextSlot();
      const tryWith = (
        preIx?: anchor.web3.TransactionInstruction,
        report = REPORT
      ) =>
        expectError(
          reveal(a, hash, 0, ZERO32, 1, { orb: { report, preIx } }),
          "InvalidOrbAttestation"
        );
      await tryWith(undefined);
      await tryWith(
        edIx(Keypair.generate(), orbMessage(hash, REPORT, a.publicKey))
      );
      await tryWith(edIx(attester, orbMessage(hash, REPORT, b.publicKey)));
      await tryWith(
        edIx(attester, orbMessage(sha256("other"), REPORT, a.publicKey))
      );
      await tryWith(
        edIx(attester, orbMessage(hash, REPORT, a.publicKey)),
        sha256("other report")
      );
      // Still registrable without ORB.
      await reveal(a, hash, 0, ZERO32);
    });

    it("attester rotation: by the attester itself or the upgrade authority, nobody else", async () => {
      const intruder = await fundedWallet();
      const next = Keypair.generate();
      await expectError(
        program.methods
          .setOrbAttester(intruder.publicKey)
          .accountsPartial({
            authority: intruder.publicKey,
            programData: programDataPda(),
          })
          .signers([intruder])
          .rpc(),
        "NotOrbAuthority"
      );
      const sig = await provider.connection.requestAirdrop(
        attester.publicKey,
        anchor.web3.LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig, "confirmed");
      await program.methods
        .setOrbAttester(next.publicKey)
        .accountsPartial({
          authority: attester.publicKey,
          programData: programDataPda(),
        })
        .signers([attester])
        .rpc();
      await program.methods
        .setOrbAttester(attester.publicKey)
        .accountsPartial({
          authority: admin.publicKey,
          programData: programDataPda(),
        })
        .rpc();
      const cfg = await program.account.orbConfig.fetch(orbConfigPda());
      assert.equal(cfg.attester.toBase58(), attester.publicKey.toBase58());
    });
  });

  describe("transferable records (MLETR-aligned)", () => {
    const etrPda = (hash: Buffer) =>
      PublicKey.findProgramAddressSync(
        [Buffer.from("etr"), hash],
        program.programId
      )[0];

    let issuer: Keypair, alice: Keypair, bob: Keypair;
    let doc: Buffer, docV2: Buffer, record: PublicKey;

    beforeEach(async () => {
      [issuer, alice, bob] = await Promise.all([
        fundedWallet(),
        fundedWallet(),
        fundedWallet(),
      ]);
      doc = sha256("promissory note " + randomBytes(8).toString("hex"));
      docV2 = sha256("promissory note v2 " + randomBytes(8).toString("hex"));
      record = etrPda(doc);
      await program.methods
        .issueRecord(arr(doc), ZERO32, alice.publicKey)
        .accountsPartial({ issuer: issuer.publicKey })
        .signers([issuer])
        .rpc();
    });

    it("issues with control to the holder; the hash can never be issued again", async () => {
      const r = await program.account.transferableRecord.fetch(record);
      assert.equal(r.issuer.toBase58(), issuer.publicKey.toBase58());
      assert.equal(r.controller.toBase58(), alice.publicKey.toBase58());
      assert.equal(r.version, 1);
      assert.equal(r.status, 1);
      await expectError(
        program.methods
          .issueRecord(arr(doc), ZERO32, bob.publicKey)
          .accountsPartial({ issuer: bob.publicKey })
          .signers([bob])
          .rpc(),
        "already in use"
      );
    });

    it("only the person in control can pass control on", async () => {
      await expectError(
        program.methods
          .transferControl(bob.publicKey)
          .accountsPartial({ controller: issuer.publicKey, record })
          .signers([issuer])
          .rpc(),
        "NotController"
      );
      await program.methods
        .transferControl(bob.publicKey)
        .accountsPartial({ controller: alice.publicKey, record })
        .signers([alice])
        .rpc();
      assert.equal(
        (
          await program.account.transferableRecord.fetch(record)
        ).controller.toBase58(),
        bob.publicKey.toBase58()
      );
    });

    it("amendment: issuer proposes, controller accepts the exact hash", async () => {
      await expectError(
        program.methods
          .proposeAmendment(arr(docV2), ZERO32)
          .accountsPartial({ issuer: alice.publicKey, record })
          .signers([alice])
          .rpc(),
        "NotIssuer"
      );
      await program.methods
        .proposeAmendment(arr(docV2), ZERO32)
        .accountsPartial({ issuer: issuer.publicKey, record })
        .signers([issuer])
        .rpc();
      await expectError(
        program.methods
          .acceptAmendment(arr(sha256("other")))
          .accountsPartial({ controller: alice.publicKey, record })
          .signers([alice])
          .rpc(),
        "AmendmentMismatch"
      );
      await program.methods
        .acceptAmendment(arr(docV2))
        .accountsPartial({ controller: alice.publicKey, record })
        .signers([alice])
        .rpc();
      const r = await program.account.transferableRecord.fetch(record);
      assert.deepEqual(Buffer.from(r.documentHash), docV2);
      assert.equal(r.version, 2);
      assert.deepEqual(r.pendingHash, ZERO32);

      // The amended hash is now used: it cannot be issued as a new record.
      await expectError(
        program.methods
          .issueRecord(arr(docV2), ZERO32, bob.publicKey)
          .accountsPartial({ issuer: bob.publicKey })
          .signers([bob])
          .rpc(),
        "already in use"
      );
    });

    it("cannot propose a hash that is already used", async () => {
      await expectError(
        program.methods
          .proposeAmendment(arr(doc), ZERO32)
          .accountsPartial({ issuer: issuer.publicKey, record })
          .signers([issuer])
          .rpc(),
        "HashAlreadyUsed"
      );
    });

    it("cancel clears the proposal", async () => {
      await program.methods
        .proposeAmendment(arr(docV2), ZERO32)
        .accountsPartial({ issuer: issuer.publicKey, record })
        .signers([issuer])
        .rpc();
      await program.methods
        .cancelAmendment()
        .accountsPartial({ issuer: issuer.publicKey, record })
        .signers([issuer])
        .rpc();
      await expectError(
        program.methods
          .acceptAmendment(arr(docV2))
          .accountsPartial({ controller: alice.publicKey, record })
          .signers([alice])
          .rpc(),
        "NoPendingAmendment"
      );
    });

    it("surrender hands control to the issuer and freezes the record; then terminate", async () => {
      await program.methods
        .transferControl(bob.publicKey)
        .accountsPartial({ controller: alice.publicKey, record })
        .signers([alice])
        .rpc();
      await expectError(
        program.methods
          .terminate(0)
          .accountsPartial({ issuer: issuer.publicKey, record })
          .signers([issuer])
          .rpc(),
        "NotSurrendered"
      );
      await program.methods
        .surrender()
        .accountsPartial({ controller: bob.publicKey, record })
        .signers([bob])
        .rpc();

      let r = await program.account.transferableRecord.fetch(record);
      assert.equal(r.status, 2);
      assert.equal(r.controller.toBase58(), issuer.publicKey.toBase58());

      await expectError(
        program.methods
          .transferControl(alice.publicKey)
          .accountsPartial({ controller: issuer.publicKey, record })
          .signers([issuer])
          .rpc(),
        "NotActive"
      );
      await expectError(
        program.methods
          .terminate(3)
          .accountsPartial({ issuer: issuer.publicKey, record })
          .signers([issuer])
          .rpc(),
        "UnknownTerminationReason"
      );
      await program.methods
        .terminate(1)
        .accountsPartial({ issuer: issuer.publicKey, record })
        .signers([issuer])
        .rpc();
      r = await program.account.transferableRecord.fetch(record);
      assert.equal(r.status, 3);
      assert.deepEqual(Buffer.from(r.documentHash), doc);
    });
  });
});

function umiPublicKeyBytes(pk: ReturnType<typeof umiPublicKey>): Uint8Array {
  return new PublicKey(pk.toString()).toBytes();
}
