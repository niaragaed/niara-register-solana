// One-time setup of soulbound cNFT receipts for register_v2.
//
// Run from the repo root after deploying the upgraded program:
//
//   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
//   ANCHOR_WALLET=~/.config/solana/<upgrade-authority>.json \
//   METADATA_BASE_URL=https://niara-register.vercel.app/api/receipts/solana/ \
//   npx ts-node scripts/setup-receipts.ts
//
// ANCHOR_WALLET must be the program's upgrade authority (initialize_config
// checks it). The script prints the tree and collection addresses and writes
// them to receipts-config.<cluster>.json; commit that file.
//
// Run it again to start a new tree when the current one is full: it creates
// a fresh collection + tree and calls update_config. Existing receipts stay
// valid.
import * as anchor from "@anchor-lang/core";
import { writeFileSync } from "fs";
import { Keypair } from "@solana/web3.js";
// The committed IDL (idl/), so the setup does not need an anchor build.
import idl from "../idl/niara_register_solana.json";
import { createReceiptInfrastructure, umiFor, writeConfig } from "./receipts-setup-lib";

async function main() {
  const baseUrl = process.env.METADATA_BASE_URL;
  if (!baseUrl || !baseUrl.endsWith("/")) {
    throw new Error("METADATA_BASE_URL is required and must end with /");
  }

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new anchor.Program(idl as anchor.Idl, provider);
  const admin = (provider.wallet as anchor.Wallet).payer as Keypair;
  const rpc = provider.connection.rpcEndpoint;

  const infra = await createReceiptInfrastructure({
    umi: umiFor(rpc, admin),
    programId: program.programId,
    collectionName: "Niara Register receipts",
    collectionUri: `${baseUrl}collection`,
    maxDepth: Number(process.env.TREE_MAX_DEPTH ?? 14),
  });

  const config = await writeConfig({
    program,
    admin: admin.publicKey,
    merkleTree: infra.merkleTree,
    coreCollection: infra.coreCollection,
    metadataBaseUrl: baseUrl,
  });

  const cluster = rpc.includes("devnet") ? "devnet" : rpc.includes("mainnet") ? "mainnet" : "local";
  const out = {
    cluster,
    programId: program.programId.toBase58(),
    config: config.toBase58(),
    receiptAuthority: infra.receiptAuthority.toBase58(),
    merkleTree: infra.merkleTree.toBase58(),
    coreCollection: infra.coreCollection.toBase58(),
    metadataBaseUrl: baseUrl,
  };
  writeFileSync(`receipts-config.${cluster}.json`, JSON.stringify(out, null, 2) + "\n");
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
