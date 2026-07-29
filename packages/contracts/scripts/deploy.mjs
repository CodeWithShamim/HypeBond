#!/usr/bin/env node
/**
 * Deploys packages/contracts/hypebond.py to a GenLayer network.
 *
 * Usage:
 *   node packages/contracts/scripts/deploy.mjs [studionet|testnet-asimov]
 *
 * Env (optional, read from process env or repo-root .env):
 *   DEPLOYER_PRIVATE_KEY  0x… key. Omit on studionet to use a throwaway key.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient, createAccount, generatePrivateKey } from "genlayer-js";
import { studionet, testnetAsimov } from "genlayer-js/chains";

const here = dirname(fileURLToPath(import.meta.url));
const contractPath = join(here, "..", "hypebond.py");

// Minimal .env loader so the script works without extra deps.
for (const file of [join(here, "..", "..", "..", ".env")]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}

const networkArg = process.argv[2] ?? "studionet";
const chain = networkArg === "testnet-asimov" ? testnetAsimov : studionet;

let key = process.env.DEPLOYER_PRIVATE_KEY;
if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
  if (networkArg === "testnet-asimov") {
    console.error(
      "testnet-asimov needs a funded DEPLOYER_PRIVATE_KEY in .env (get GEN from the faucet)."
    );
    process.exit(1);
  }
  key = generatePrivateKey();
  console.log("No DEPLOYER_PRIVATE_KEY set — using a throwaway key (fine on studionet).");
}

const account = createAccount(key);
const client = createClient({ chain, account });

console.log(`Deploying HypeBond to ${chain.name} as ${account.address}`);

try {
  await client.initializeConsensusSmartContract();
} catch {
  // studionet does not need it
}

const code = readFileSync(contractPath, "utf8");
const hash = await client.deployContract({ code, args: [] });
console.log(`Deploy tx: ${hash}`);

const receipt = await client.waitForTransactionReceipt({
  hash,
  status: "ACCEPTED",
  retries: 60,
  interval: 3000,
});

const address =
  receipt?.data?.contract_address ??
  receipt?.data?.contractAddress ??
  receipt?.contract_address;

if (!address) {
  console.error("Deployed, but could not find the contract address in the receipt:");
  console.error(JSON.stringify(receipt, null, 2));
  process.exit(1);
}

console.log("");
console.log(`HypeBond deployed at: ${address}`);
console.log("");
console.log("Add this to your repo-root .env:");
console.log(`VITE_HYPEBOND_ADDRESS=${address}`);
console.log(`VITE_GENLAYER_NETWORK=${networkArg}`);
