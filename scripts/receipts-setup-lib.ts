// Creates the receipt infrastructure for register_v2 on a cluster:
//   1. an MPL-Core collection whose update authority is the program's
//      receipt-authority PDA, with the BubblegumV2 plugin (required by
//      Bubblegum v2) and PermanentFreezeDelegate { frozen: true } (makes every
//      receipt in it non-transferable from the moment it is minted);
//   2. a Bubblegum V2 tree, delegated to the same PDA;
//   3. the program's Config account pointing at both.
//
// Shared by scripts/setup-receipts.ts (devnet/mainnet) and the tests.
import * as anchor from "@anchor-lang/core";
import { Keypair, PublicKey } from "@solana/web3.js";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  generateSigner,
  keypairIdentity,
  publicKey as umiPublicKey,
  type Umi,
} from "@metaplex-foundation/umi";
import { createCollection, mplCore } from "@metaplex-foundation/mpl-core";
import {
  createTreeV2,
  mplBubblegum,
  setTreeDelegate,
} from "@metaplex-foundation/mpl-bubblegum";

export const RECEIPT_AUTHORITY_SEED = Buffer.from("receipt_authority");
export const CONFIG_SEED = Buffer.from("config");

export type ReceiptSetup = {
  merkleTree: PublicKey;
  coreCollection: PublicKey;
  receiptAuthority: PublicKey;
  config: PublicKey;
};

export function receiptAuthorityPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([RECEIPT_AUTHORITY_SEED], programId)[0];
}

export function configPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([CONFIG_SEED], programId)[0];
}

export function umiFor(rpcUrl: string, admin: Keypair): Umi {
  const umi = createUmi(rpcUrl, "confirmed").use(mplCore()).use(mplBubblegum());
  umi.use(keypairIdentity(umi.eddsa.createKeypairFromSecretKey(admin.secretKey)));
  return umi;
}

export async function createReceiptInfrastructure(opts: {
  umi: Umi;
  programId: PublicKey;
  collectionName: string;
  collectionUri: string;
  /** 14 → 16,384 receipts. Raise for production (20 → ~1M). */
  maxDepth?: number;
  maxBufferSize?: number;
}): Promise<{ merkleTree: PublicKey; coreCollection: PublicKey; receiptAuthority: PublicKey }> {
  const { umi, programId } = opts;
  const receiptAuthority = receiptAuthorityPda(programId);
  const authority = umiPublicKey(receiptAuthority.toBase58());

  const collection = generateSigner(umi);
  await createCollection(umi, {
    collection,
    name: opts.collectionName,
    uri: opts.collectionUri,
    updateAuthority: authority,
    plugins: [
      { type: "BubblegumV2" },
      {
        type: "PermanentFreezeDelegate",
        frozen: true,
        authority: { type: "Address", address: authority },
      },
    ],
  }).sendAndConfirm(umi);

  const merkleTree = generateSigner(umi);
  // Receipts are never transferred or burned, so no proofs are ever needed:
  // canopy 0 keeps the tree as cheap as possible.
  await (
    await createTreeV2(umi, {
      merkleTree,
      maxDepth: opts.maxDepth ?? 14,
      maxBufferSize: opts.maxBufferSize ?? 64,
      canopyDepth: 0,
      public: false,
    })
  ).sendAndConfirm(umi);

  await setTreeDelegate(umi, {
    merkleTree: merkleTree.publicKey,
    newTreeDelegate: authority,
  }).sendAndConfirm(umi);

  return {
    merkleTree: new PublicKey(merkleTree.publicKey),
    coreCollection: new PublicKey(collection.publicKey),
    receiptAuthority,
  };
}

/** Calls initialize_config, or update_config when the config already exists. */
export async function writeConfig(opts: {
  program: anchor.Program<any>;
  admin: PublicKey;
  merkleTree: PublicKey;
  coreCollection: PublicKey;
  metadataBaseUrl: string;
}): Promise<PublicKey> {
  const { program } = opts;
  const config = configPda(program.programId);
  const existing = await program.provider.connection.getAccountInfo(config);
  if (existing) {
    await program.methods
      .updateConfig(opts.merkleTree, opts.coreCollection, opts.metadataBaseUrl)
      .accounts({ admin: opts.admin })
      .rpc();
  } else {
    const programData = PublicKey.findProgramAddressSync(
      [program.programId.toBuffer()],
      new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
    )[0];
    await program.methods
      .initializeConfig(opts.merkleTree, opts.coreCollection, opts.metadataBaseUrl)
      .accounts({ admin: opts.admin, programData })
      .rpc();
  }
  return config;
}
