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
import { NiaraRegisterSolana } from "../target/types/niara_register_solana";
import {
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

async function expectError(promise: Promise<unknown>, fragment: string) {
  try {
    await promise;
  } catch (e) {
    const text = String(e) + JSON.stringify((e as any).logs ?? (e as any).transactionLogs ?? []);
    assert.include(text, fragment);
    return;
  }
  assert.fail(`should have failed with ${fragment}`);
}

describe("niara-register v2 (Solana)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.niaraRegisterSolana as Program<NiaraRegisterSolana>;
  const admin = (provider.wallet as anchor.Wallet).payer as Keypair;
  const umi = umiFor(provider.connection.rpcEndpoint, admin);

  let merkleTree: PublicKey;
  let coreCollection: PublicKey;
  let receiptAuthority: PublicKey;

  async function fundedWallet() {
    const kp = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(kp.publicKey, anchor.web3.LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig, "confirmed");
    return kp;
  }

  const recordPda = (hash: Buffer) =>
    PublicKey.findProgramAddressSync([Buffer.from("record_v2"), hash], program.programId)[0];

  const treeConfigPda = () => PublicKey.findProgramAddressSync([merkleTree.toBuffer()], BUBBLEGUM)[0];

  // Waits for "confirmed": the Metaplex (umi) reads below use that commitment,
  // and Anchor's rpc() returns as soon as the transaction is "processed".
  async function registerV2(signer: Keypair, hash: Buffer, scheme: number, meta: number[]) {
    const sig = await program.methods
      .registerV2(arr(hash), scheme, meta)
      .accounts({
        signer: signer.publicKey,
        merkleTree,
        coreCollection,
      })
      .signers([signer])
      .rpc();
    await provider.connection.confirmTransaction(sig, "confirmed");
    return sig;
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
      const collection = await fetchCollection(umi, umiPublicKey(coreCollection.toBase58()));
      assert.equal(collection.updateAuthority.toString(), receiptAuthority.toBase58());
      assert.isTrue(collection.permanentFreezeDelegate?.frozen);
      assert.equal(
        (collection.permanentFreezeDelegate?.authority as any).address.toString(),
        receiptAuthority.toBase58()
      );
      assert.isDefined(collection.bubblegumV2);
    });

    it("only the admin can update the config", async () => {
      const intruder = await fundedWallet();
      await expectError(
        program.methods
          .updateConfig(merkleTree, coreCollection, "https://evil.example/")
          .accounts({ admin: intruder.publicKey })
          .signers([intruder])
          .rpc(),
        "NotUpgradeAuthority"
      );
    });

    it("initialize_config cannot run twice", async () => {
      const programData = PublicKey.findProgramAddressSync(
        [program.programId.toBuffer()],
        new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
      )[0];
      await expectError(
        program.methods
          .initializeConfig(merkleTree, coreCollection, BASE_URL)
          .accounts({ admin: admin.publicKey, programData })
          .rpc(),
        "already in use"
      );
    });
  });

  describe("register_v2", () => {
    it("stores no readable metadata and mints a receipt leaf owned by the signer", async () => {
      const signer = await fundedWallet();
      const fileHash = sha256("signed pdf " + Date.now());
      const salt = randomBytes(32);
      const meta = sha256("niara-meta-v1", salt, '{"name":"Lease","type":"contract"}');

      await registerV2(signer, fileHash, 0, arr(meta));

      const rec = await program.account.recordV2.fetch(recordPda(fileHash));
      assert.equal(rec.signer.toBase58(), signer.publicKey.toBase58());
      assert.deepEqual(Buffer.from(rec.recordHash), fileHash);
      assert.equal(rec.scheme, 0);
      assert.deepEqual(Buffer.from(rec.metadataCommitment), meta);
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
      const tree = await fetchMerkleTree(umi, umiPublicKey(merkleTree.toBase58()));
      const onChainRoot = Buffer.from(getCurrentRoot(tree.tree)).toString("hex");
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

    it("emits DocumentRegisteredV2", async () => {
      const signer = await fundedWallet();
      const hash = sha256("niara-record-v1", randomBytes(32), sha256("file " + Date.now()));
      let event: any = null;
      const listener = program.addEventListener("documentRegisteredV2", (e) => {
        event = e;
      });
      await registerV2(signer, hash, 1, ZERO32);
      for (let i = 0; i < 20 && !event; i++) await new Promise((r) => setTimeout(r, 200));
      await program.removeEventListener(listener);
      assert.isNotNull(event);
      assert.deepEqual(Buffer.from(event.recordHash), hash);
      assert.equal(event.signer.toBase58(), signer.publicKey.toBase58());
      assert.equal(event.scheme, 1);
      assert.deepEqual(event.metadataCommitment, ZERO32);
    });

    it("one record per hash, whoever signs", async () => {
      const a = await fundedWallet();
      const b = await fundedWallet();
      const hash = sha256("dup " + Date.now());
      await registerV2(a, hash, 0, ZERO32);
      await expectError(registerV2(b, hash, 1, ZERO32), "already in use");
    });

    it("rejects a zero hash and unknown schemes", async () => {
      const a = await fundedWallet();
      await expectError(registerV2(a, Buffer.alloc(32), 0, ZERO32), "HashInvalido");
      await expectError(registerV2(a, sha256("s " + Date.now()), 2, ZERO32), "UnknownScheme");
    });

    it("rejects a tree or collection other than the configured ones", async () => {
      const a = await fundedWallet();
      await expectError(
        program.methods
          .registerV2(arr(sha256("x " + Date.now())), 0, ZERO32)
          .accounts({ signer: a.publicKey, merkleTree: Keypair.generate().publicKey, coreCollection })
          .signers([a])
          .rpc(),
        "ConfigMismatch"
      );
    });

    it("tree mint count advances with each receipt", async () => {
      const before = (await provider.connection.getAccountInfo(treeConfigPda()))!.data;
      const a = await fundedWallet();
      await registerV2(a, sha256("count " + Date.now()), 0, ZERO32);
      const after = (await provider.connection.getAccountInfo(treeConfigPda()))!.data;
      // TreeConfig: 8 disc + 32 creator + 32 delegate + 8 capacity + 8 num_minted
      assert.equal(after.readBigUInt64LE(80), before.readBigUInt64LE(80) + 1n);
    });
  });

  describe("transferable records (MLETR-aligned)", () => {
    const etrPda = (hash: Buffer) =>
      PublicKey.findProgramAddressSync([Buffer.from("etr"), hash], program.programId)[0];

    let issuer: Keypair, alice: Keypair, bob: Keypair;
    let doc: Buffer, docV2: Buffer, record: PublicKey;

    beforeEach(async () => {
      [issuer, alice, bob] = await Promise.all([fundedWallet(), fundedWallet(), fundedWallet()]);
      doc = sha256("promissory note " + randomBytes(8).toString("hex"));
      docV2 = sha256("promissory note v2 " + randomBytes(8).toString("hex"));
      record = etrPda(doc);
      await program.methods
        .issueRecord(arr(doc), ZERO32, alice.publicKey)
        .accounts({ issuer: issuer.publicKey })
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
          .accounts({ issuer: bob.publicKey })
          .signers([bob])
          .rpc(),
        "already in use"
      );
    });

    it("only the person in control can pass control on", async () => {
      await expectError(
        program.methods
          .transferControl(bob.publicKey)
          .accounts({ controller: issuer.publicKey, record })
          .signers([issuer])
          .rpc(),
        "NotController"
      );
      await program.methods
        .transferControl(bob.publicKey)
        .accounts({ controller: alice.publicKey, record })
        .signers([alice])
        .rpc();
      assert.equal(
        (await program.account.transferableRecord.fetch(record)).controller.toBase58(),
        bob.publicKey.toBase58()
      );
    });

    it("amendment: issuer proposes, controller accepts the exact hash", async () => {
      await expectError(
        program.methods
          .proposeAmendment(arr(docV2), ZERO32)
          .accounts({ issuer: alice.publicKey, record })
          .signers([alice])
          .rpc(),
        "NotIssuer"
      );
      await program.methods
        .proposeAmendment(arr(docV2), ZERO32)
        .accounts({ issuer: issuer.publicKey, record })
        .signers([issuer])
        .rpc();
      await expectError(
        program.methods
          .acceptAmendment(arr(sha256("other")))
          .accounts({ controller: alice.publicKey, record })
          .signers([alice])
          .rpc(),
        "AmendmentMismatch"
      );
      await program.methods
        .acceptAmendment(arr(docV2))
        .accounts({ controller: alice.publicKey, record })
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
          .accounts({ issuer: bob.publicKey })
          .signers([bob])
          .rpc(),
        "already in use"
      );
    });

    it("cannot propose a hash that is already used", async () => {
      await expectError(
        program.methods
          .proposeAmendment(arr(doc), ZERO32)
          .accounts({ issuer: issuer.publicKey, record })
          .signers([issuer])
          .rpc(),
        "HashAlreadyUsed"
      );
    });

    it("cancel clears the proposal", async () => {
      await program.methods
        .proposeAmendment(arr(docV2), ZERO32)
        .accounts({ issuer: issuer.publicKey, record })
        .signers([issuer])
        .rpc();
      await program.methods.cancelAmendment().accounts({ issuer: issuer.publicKey, record }).signers([issuer]).rpc();
      await expectError(
        program.methods
          .acceptAmendment(arr(docV2))
          .accounts({ controller: alice.publicKey, record })
          .signers([alice])
          .rpc(),
        "NoPendingAmendment"
      );
    });

    it("surrender hands control to the issuer and freezes the record; then terminate", async () => {
      await program.methods
        .transferControl(bob.publicKey)
        .accounts({ controller: alice.publicKey, record })
        .signers([alice])
        .rpc();
      await expectError(
        program.methods.terminate(0).accounts({ issuer: issuer.publicKey, record }).signers([issuer]).rpc(),
        "NotSurrendered"
      );
      await program.methods.surrender().accounts({ controller: bob.publicKey, record }).signers([bob]).rpc();

      let r = await program.account.transferableRecord.fetch(record);
      assert.equal(r.status, 2);
      assert.equal(r.controller.toBase58(), issuer.publicKey.toBase58());

      await expectError(
        program.methods
          .transferControl(alice.publicKey)
          .accounts({ controller: issuer.publicKey, record })
          .signers([issuer])
          .rpc(),
        "NotActive"
      );
      await expectError(
        program.methods.terminate(3).accounts({ issuer: issuer.publicKey, record }).signers([issuer]).rpc(),
        "UnknownTerminationReason"
      );
      await program.methods.terminate(1).accounts({ issuer: issuer.publicKey, record }).signers([issuer]).rpc();
      r = await program.account.transferableRecord.fetch(record);
      assert.equal(r.status, 3);
      assert.deepEqual(Buffer.from(r.documentHash), doc);
    });
  });
});

function umiPublicKeyBytes(pk: ReturnType<typeof umiPublicKey>): Uint8Array {
  return new PublicKey(pk.toString()).toBytes();
}
