#!/usr/bin/env node
/**
 * Proves that settlement actually MOVES MONEY on a deployed contract.
 *
 * This is the gate the old deployment silently failed. `smoke.mjs` stops at
 * validation and the cancellation notice, and the offline suite runs against
 * a test double — neither one watches the child transaction that carries the
 * escrow. So deployment 0x8D656B0D… passed every gate while every settlement
 * burned its escrow: the payout was emitted as an INTERNAL message, the chain
 * looked for a contract at the payee's wallet address, found none, and failed
 * the child transaction with "Contract 0x… not found" AFTER the parent call
 * had already succeeded and debited the contract.
 *
 * Nothing on the parent transaction shows that. The only reliable evidence is
 * downstream, so that is what this asserts: create a deal, decline it, and
 * check the child transaction is a value transfer (type 0 = SEND) that
 * finalized without an error, that the brand's wallet balance actually went
 * up by the escrow, and that the contract released exactly that much.
 *
 * Usage: node verify-payout.mjs [0x<contract-address>]
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
    const m = readFileSync(envFile, "utf8").match(
      /^VITE_HYPEBOND_ADDRESS=(0x[0-9a-fA-F]{40})$/m
    );
    if (m) address = m[1];
  }
}

const RPC = studionet.rpcUrls.default.http[0];
const brand = createAccount(generatePrivateKey());
const influencer = createAccount(generatePrivateKey());
const bc = createClient({ chain: studionet, account: brand });
const ic = createClient({ chain: studionet, account: influencer });

async function rpc(method, params) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await res.json();
  if (body.error) throw new Error(`${method}: ${JSON.stringify(body.error)}`);
  return body.result;
}

async function fundTo(addr, target) {
  const CHUNK = 9_000_000_000_000_000;
  for (let i = 0; i < 60; i++) {
    const bal = BigInt(await bc.getBalance({ address: addr }));
    if (bal >= target) return bal;
    await rpc("sim_fundAccount", [addr, CHUNK]);
    await new Promise((r) => setTimeout(r, 1200));
  }
  throw new Error(`never funded ${addr}`);
}

const ESCROW = 10n ** 16n;
const TERMS =
  "POST REQUIREMENTS:\n- Platform: X (Twitter)\n- Must mention @hypebond and #ad\n- Original post, not a reply\n- Stay live 3 days";

await fundTo(brand.address, ESCROW * 4n);

let fails = 0;
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : ` — ${detail}`}`);
  if (!ok) fails++;
};

const h1 = await bc.writeContract({
  address,
  functionName: "create_deal",
  args: [influencer.address, TERMS, "x", 3],
  value: ESCROW,
});
await bc.waitForTransactionReceipt({
  hash: h1,
  status: TransactionStatus.ACCEPTED,
  retries: 60,
  interval: 3000,
});
const dealId = Number(await bc.readContract({ address, functionName: "get_deal_count", args: [] }));
console.log(`created deal ${dealId}, escrow ${ESCROW}`);

const balBefore = BigInt(await bc.getBalance({ address: brand.address }));
// Delta, not absolute: other deals (e.g. from smoke.mjs) may still be escrowed here.
const contractBefore = BigInt(await bc.getBalance({ address }));

const h2 = await ic.writeContract({ address, functionName: "decline_deal", args: [dealId] });
const r2 = await ic.waitForTransactionReceipt({
  hash: h2,
  status: TransactionStatus.FINALIZED,
  retries: 120,
  interval: 3000,
});

const deal = await bc.readContract({ address, functionName: "get_deal", args: [BigInt(dealId)] });
check("deal reads DECLINED / settled", deal.status === "DECLINED" && deal.settled === true, JSON.stringify(deal.status));

const triggered = r2?.triggered_transactions ?? [];
check("decline emitted exactly one child transaction", triggered.length === 1, `got ${triggered.length}`);

for (const t of triggered) {
  let tx;
  for (let i = 0; i < 60; i++) {
    tx = await rpc("eth_getTransactionByHash", [t]);
    if (tx?.status === "FINALIZED" || tx?.status === "UNDETERMINED") break;
    await new Promise((r) => setTimeout(r, 3000));
  }
  const lr = tx?.consensus_data?.leader_receipt?.[0];
  const err = lr?.result ? Buffer.from(lr.result, "base64").toString("utf8") : "";
  check("payout child tx is a value transfer (type 0 = SEND)", tx?.type === 0, `type=${tx?.type}`);
  check("payout child tx FINALIZED", tx?.status === "FINALIZED", String(tx?.status));
  check("payout child tx has no execution error", lr?.execution_result !== "ERROR", err.slice(0, 120));
  check("payout was not routed to contract_not_found_handler", lr?.node_config?.address !== "contract_not_found_handler");
}

let credited = 0n;
for (let i = 0; i < 60; i++) {
  credited = BigInt(await bc.getBalance({ address: brand.address })) - balBefore;
  if (credited >= ESCROW) break;
  await new Promise((r) => setTimeout(r, 3000));
}
check("brand wallet credited the full escrow", credited === ESCROW, `credited ${credited} of ${ESCROW}`);

const contractDelta = contractBefore - BigInt(await bc.getBalance({ address }));
check(
  "contract released exactly this deal's escrow",
  contractDelta === ESCROW,
  `released ${contractDelta} of ${ESCROW}`
);

console.log(`\nResult: ${fails === 0 ? "all payout checks passed" : `${fails} FAILED`}`);
process.exit(fails === 0 ? 0 : 1);
