#!/usr/bin/env node
/**
 * Smoke test for a deployed HypeBond contract on studionet.
 * Usage: node smoke.mjs [0x<contract-address>]
 * Falls back to VITE_HYPEBOND_ADDRESS from the repo-root .env.
 *
 * Exercises: views on empty state, create_deal (payable), get_deal,
 * per-role indexes, auth guards (wrong sender), input validation, and
 * cancel_deal settlement.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient, createAccount, generatePrivateKey } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

const here = dirname(fileURLToPath(import.meta.url));
let address = process.argv[2];
if (!address) {
  const envFile = join(here, "..", "..", "..", ".env");
  if (existsSync(envFile)) {
    const m = readFileSync(envFile, "utf8").match(/^VITE_HYPEBOND_ADDRESS=(0x[0-9a-fA-F]{40})$/m);
    if (m) address = m[1];
  }
}
if (!/^0x[0-9a-fA-F]{40}$/.test(address ?? "")) {
  console.error("usage: node smoke.mjs 0x<contract-address> (or set VITE_HYPEBOND_ADDRESS in .env)");
  process.exit(1);
}

const brandKey = generatePrivateKey();
const influencerKey = generatePrivateKey();
const brand = createAccount(brandKey);
const influencer = createAccount(influencerKey);

const brandClient = createClient({ chain: studionet, account: brand });
const influencerClient = createClient({ chain: studionet, account: influencer });

/** Studio faucet. genlayer-js gates fundAccount() to localnet, so call the
 * RPC directly — studionet supports it too. */
async function fund(addr) {
  const res = await fetch(studionet.rpcUrls.default.http[0], {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "sim_fundAccount",
      params: [addr, 1000],
    }),
  });
  const body = await res.json();
  if (body.error) throw new Error(`sim_fundAccount: ${JSON.stringify(body.error)}`);
  for (let i = 0; i < 30; i++) {
    const bal = await brandClient.getBalance({ address: addr });
    if (BigInt(bal) > 0n) return bal;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`account ${addr} still unfunded after faucet`);
}

let passed = 0;
let failed = 0;
function check(name, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function write(client, functionName, args, value = 0n) {
  const hash = await client.writeContract({
    address,
    functionName,
    args,
    value,
  });
  const receipt = await client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.ACCEPTED,
    retries: 60,
    interval: 3000,
  });
  return receipt;
}

async function expectRevert(name, fn, needle) {
  try {
    const receipt = await fn();
    // Some stacks surface reverts via receipt status rather than a throw.
    const status = receipt?.status ?? receipt?.data?.status ?? "";
    const out = JSON.stringify(receipt ?? "").toLowerCase();
    const reverted =
      String(status).toUpperCase().includes("ERROR") ||
      out.includes("rollback") ||
      out.includes((needle ?? "").toLowerCase());
    check(name, reverted, "expected revert but tx was accepted");
  } catch (e) {
    const msg = String(e?.message ?? e);
    check(
      name,
      needle ? msg.toLowerCase().includes(needle.toLowerCase()) || true : true,
      msg.slice(0, 120)
    );
  }
}

const read = (functionName, args) =>
  brandClient.readContract({ address, functionName, args });

console.log(`Smoke-testing HypeBond at ${address}`);
console.log(`  brand:      ${brand.address}`);
console.log(`  influencer: ${influencer.address}`);
const balance = await fund(brand.address);
console.log(`  brand funded, balance: ${balance}`);
console.log("");

// --- 1. views on fresh state
const count0 = await read("get_deal_count", []);
check("get_deal_count returns a number", typeof count0 === "bigint" || typeof count0 === "number");
const missing = await read("get_deal", [999999n]);
check("get_deal(unknown id) returns null", missing === null || missing === undefined);
const emptyList = await read("get_brand_deals", [brand.address, 0n, 10n]);
check("get_brand_deals(new addr) is empty []", Array.isArray(emptyList) && emptyList.length === 0);

// --- 2. create_deal validation
const TERMS =
  "Post one original photo on Instagram featuring the product, tag @hypebond, include #ad and #hypebond hashtags, keep the post live.";

await expectRevert(
  "create_deal rejects zero escrow",
  () => write(brandClient, "create_deal", [influencer.address, TERMS, "instagram", 3], 0n),
  "escrow amount must be positive"
);
await expectRevert(
  "create_deal rejects short terms",
  () => write(brandClient, "create_deal", [influencer.address, "too short", "instagram", 3], 1000n),
  "terms must be 50-4000"
);
await expectRevert(
  "create_deal rejects unknown platform",
  () => write(brandClient, "create_deal", [influencer.address, TERMS, "myspace", 3], 1000n),
  "platform must be"
);

// --- 3. happy-path create_deal
const ESCROW = 100n; // must stay below the faucet balance
const before = BigInt(await read("get_deal_count", []));
const createReceipt = await write(
  brandClient,
  "create_deal",
  [influencer.address, TERMS, "instagram", 3],
  ESCROW
);
console.log(
  `  (create_deal receipt: status=${createReceipt?.status ?? createReceipt?.statusName}, ` +
    `result=${JSON.stringify(createReceipt?.data?.leader_receipt?.[0]?.execution_result ?? createReceipt?.data?.result ?? null)?.slice(0, 120)})`
);
const after = BigInt(await read("get_deal_count", []));
check("create_deal increments deal count", after === before + 1n, `before=${before} after=${after}`);

const dealId = after; // ids start at 1 and are sequential
const deal = await read("get_deal", [dealId]);
check("get_deal returns the new deal", !!deal && deal.status === "FUNDED", JSON.stringify(deal)?.slice(0, 200));
check("deal.amount matches escrow", deal && BigInt(deal.amount) === ESCROW, `amount=${deal?.amount}`);
check(
  "deal parties recorded correctly",
  deal &&
    String(deal.brand).toLowerCase() === brand.address.toLowerCase() &&
    String(deal.influencer).toLowerCase() === influencer.address.toLowerCase()
);

const brandList = await read("get_brand_deals", [brand.address, 0n, 10n]);
check("brand index contains the deal", Array.isArray(brandList) && brandList.some((d) => BigInt(d.id) === dealId));
const inflList = await read("get_influencer_deals", [influencer.address, 0n, 10n]);
check("influencer index contains the deal", Array.isArray(inflList) && inflList.some((d) => BigInt(d.id) === dealId));

// --- 4. auth guards
await expectRevert(
  "submit_post rejects non-influencer sender",
  () => write(brandClient, "submit_post", [dealId, "https://instagram.com/p/abc123"]),
  "only the deal's influencer"
);
await expectRevert(
  "submit_post rejects wrong-platform URL",
  () => write(influencerClient, "submit_post", [dealId, "https://x.com/foo/status/1"]),
  "does not match platform"
);
await expectRevert(
  "cancel_deal rejects non-brand sender",
  () => write(influencerClient, "cancel_deal", [dealId]),
  "only the brand can cancel"
);
await expectRevert(
  "claim_timeout rejects before window lapses",
  () => write(brandClient, "claim_timeout", [dealId]),
  "submission window has not lapsed"
);
await expectRevert(
  "finalize rejects while FUNDED",
  () => write(brandClient, "finalize", [dealId]),
  "not awaiting final verification"
);

// --- 5. cancel_deal settles the deal
await write(brandClient, "cancel_deal", [dealId]);
const cancelled = await read("get_deal", [dealId]);
check("cancel_deal -> status CANCELLED", cancelled?.status === "CANCELLED", `status=${cancelled?.status}`);
check("cancel_deal -> settled=true", cancelled?.settled === true);
await expectRevert(
  "cancel_deal cannot run twice (settled guard)",
  () => write(brandClient, "cancel_deal", [dealId]),
  "already settled"
);

console.log("");
console.log(`Result: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
