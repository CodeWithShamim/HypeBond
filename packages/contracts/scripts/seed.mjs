#!/usr/bin/env node
/**
 * Seeds a DEPLOYED HypeBond contract with a realistic deal book.
 *
 *   node packages/contracts/scripts/seed.mjs [options]
 *
 * Every transaction is a real transaction: a distinct persona wallet signs it,
 * pays for it, and the contract runs its full logic — including the live web
 * fetch plus LLM consensus round that `submit_post` triggers. Nothing here
 * writes state the contract would not have written for a real user, which is
 * the whole point: seeded deals have to survive the same views, the same
 * timeline derivation and the same settlement paths as organic ones.
 *
 * WHICH STATUSES A SEED CAN REACH. The contract takes its clock from the block
 * context and studionet has no time-travel RPC, so anything gated on a window
 * lapsing is out of reach on a fresh seed: PAID and VERIFIED_FAIL need the live
 * window (>= 1 day) to end, CANCELLED needs the 24h notice to mature, REFUNDED
 * needs a 48h/14d timeout. What a seed CAN produce, and does:
 *
 *   FUNDED        escrow locked, waiting on the creator
 *   FUNDED + notice  brand opened a cancellation notice (visible on-chain)
 *   SUBMITTED     URL in, page unreachable, check retryable
 *   VERIFYING     initial check passed, live window running
 *   GRACE_PERIOD  initial check failed, 48h to fix or repost
 *   DECLINED      creator refused the bond, brand refunded (a real payout)
 *
 * The mix between SUBMITTED / VERIFYING / GRACE_PERIOD is NOT scripted. The
 * validators fetch the URL for real and judge it against the terms for real,
 * so the split falls out of what the render engine actually retrieves. That is
 * why the summary reports it rather than promising it.
 *
 * Options
 *   --tx <n>          transaction budget, 10..200        (default 70)
 *   --address 0x…     contract to seed          (default VITE_HYPEBOND_ADDRESS)
 *   --for 0x…         also address ~1 in 6 deals to this wallet, so a real
 *                     person's creator dashboard has incoming bonds. Their
 *                     deals are never submitted or declined (no key for them).
 *   --seed <n>        PRNG seed; same seed = same personas, amounts and terms
 *   --concurrency <n> parallel in-flight transactions, 1..8   (default 4)
 *   --dry-run         print the plan, touch nothing
 *   --yes             skip the confirmation prompt
 *
 * Studionet only. Funding personas needs the `sim_fundAccount` faucet, and the
 * wallets are throwaway keys from a seeded PRNG — never point this at a network
 * where either of those matters.
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { createInterface } from "node:readline/promises";
import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");

// ---------------------------------------------------------------- config

for (const file of [join(repoRoot, ".env")]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}

function parseArgs(argv) {
  const out = { dryRun: false, yes: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--tx") out.tx = Number(next());
    else if (a === "--address") out.address = next();
    else if (a === "--for") out.forAddress = next();
    else if (a === "--seed") out.seed = Number(next());
    else if (a === "--concurrency") out.concurrency = Number(next());
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--yes" || a === "-y") out.yes = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else if (/^0x[0-9a-fA-F]{40}$/.test(a) && !out.address) out.address = a;
    else die(`unknown argument: ${a} (try --help)`);
  }
  return out;
}

function die(msg) {
  console.error(`seed: ${msg}`);
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0]);
  process.exit(0);
}

const NETWORK = process.env.VITE_GENLAYER_NETWORK ?? "studionet";
if (NETWORK !== "studionet") {
  die(
    `VITE_GENLAYER_NETWORK is "${NETWORK}". Seeding needs the studionet faucet ` +
      `and uses throwaway keys — it is deliberately studionet-only.`
  );
}

const ADDRESS =
  args.address ??
  (process.env.VITE_HYPEBOND_ADDRESS || "").trim();
if (!/^0x[0-9a-fA-F]{40}$/.test(ADDRESS))
  die("no contract address — pass --address 0x… or set VITE_HYPEBOND_ADDRESS in .env");

if (args.forAddress && !/^0x[0-9a-fA-F]{40}$/.test(args.forAddress))
  die(`--for must be a 0x address, got ${args.forAddress}`);

const TX_BUDGET = clampInt(args.tx ?? 70, 10, 200, "--tx");
const CONCURRENCY = clampInt(args.concurrency ?? 4, 1, 8, "--concurrency");
const SEED = Number.isFinite(args.seed) ? args.seed >>> 0 : (Math.random() * 2 ** 32) >>> 0;

function clampInt(v, lo, hi, name) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) die(`${name} must be a number`);
  return Math.min(hi, Math.max(lo, n));
}

const RPC = studionet.rpcUrls.default.http[0];
const GEN = 10n ** 18n;

// ---------------------------------------------------------------- rng
//
// Seeded on purpose. A seed run that cannot be reproduced is a dataset nobody
// can debug: `--seed 42` gives back the same personas, the same wallets, the
// same escrows and the same briefs, so a screenshot can be regenerated.

function mulberry32(a) {
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(SEED);
const rand = (lo, hi) => lo + rng() * (hi - lo);
const randInt = (lo, hi) => Math.floor(rand(lo, hi + 1));
const pick = (arr) => arr[randInt(0, arr.length - 1)];
const chance = (p) => rng() < p;
function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
/** 32 random bytes from the seeded PRNG. Throwaway studionet keys only. */
function seededPrivateKey() {
  let hex = "0x";
  for (let i = 0; i < 32; i++) hex += randInt(0, 255).toString(16).padStart(2, "0");
  return hex;
}

// ---------------------------------------------------------------- personas

const BRANDS = [
  { name: "Northwind Athletics", handle: "@northwind", site: "northwind.co", tags: ["#ad", "#northwind"], tier: "mid", topics: ["fitness", "outdoor"] },
  { name: "Aurora Labs", handle: "@auroralabs", site: "auroralabs.io", tags: ["#ad", "#aurorastudio"], tier: "high", topics: ["tech", "creative"] },
  { name: "Cedar & Co Coffee", handle: "@cedarandco", site: "cedarandco.coffee", tags: ["#ad", "#cedarmornings"], tier: "low", topics: ["food", "lifestyle"] },
  { name: "Halcyon Audio", handle: "@halcyonaudio", site: "halcyonaudio.com", tags: ["#ad", "#halcyonone"], tier: "high", topics: ["tech", "creative"] },
  { name: "Bright Fork Kitchen", handle: "@brightfork", site: "brightfork.kitchen", tags: ["#ad", "#brightfork"], tier: "low", topics: ["food", "lifestyle"] },
  { name: "Vantage Fintech", handle: "@vantageapp", site: "vantage.finance", tags: ["#ad", "#vantageapp"], tier: "high", topics: ["finance", "tech"] },
  { name: "Solstice Skincare", handle: "@solsticeskin", site: "solsticeskin.com", tags: ["#ad", "#solsticeglow"], tier: "mid", topics: ["beauty", "lifestyle"] },
  { name: "Ridgeline Outdoor", handle: "@ridgeline", site: "ridgelineoutdoor.com", tags: ["#ad", "#ridgeline"], tier: "mid", topics: ["outdoor", "fitness"] },
  { name: "Pixel Forge Games", handle: "@pixelforge", site: "pixelforge.gg", tags: ["#ad", "#forgeddaily"], tier: "mid", topics: ["gaming", "tech"] },
  { name: "Orbit Mobility", handle: "@orbitmobility", site: "orbitmobility.com", tags: ["#ad", "#rideorbit"], tier: "high", topics: ["mobility", "tech"] },
  { name: "Fable Home", handle: "@fablehome", site: "fablehome.store", tags: ["#ad", "#fablehome"], tier: "low", topics: ["lifestyle", "books"] },
  { name: "Kite Energy Drinks", handle: "@drinkkite", site: "drinkkite.com", tags: ["#ad", "#flywithkite"], tier: "mid", topics: ["fitness", "gaming"] },
];

const CREATORS = [
  { handle: "@maya.builds", niche: "product reviews", platforms: ["youtube", "x"], topics: ["tech", "creative"] },
  { handle: "@theo_runs", niche: "running and endurance", platforms: ["instagram", "tiktok"], topics: ["fitness", "outdoor"] },
  { handle: "@nadia.codes", niche: "developer tooling", platforms: ["x", "youtube"], topics: ["tech"] },
  { handle: "@sam.brews", niche: "coffee and cafes", platforms: ["instagram", "tiktok"], topics: ["food", "lifestyle"] },
  { handle: "@lena.fit", niche: "home fitness", platforms: ["tiktok", "instagram"], topics: ["fitness"] },
  { handle: "@oskar.audio", niche: "audio gear", platforms: ["youtube", "x"], topics: ["tech", "creative"] },
  { handle: "@priya.eats", niche: "quick recipes", platforms: ["instagram", "tiktok"], topics: ["food", "lifestyle"] },
  { handle: "@dev.with.jules", niche: "software engineering", platforms: ["youtube", "x"], topics: ["tech"] },
  { handle: "@wren.outside", niche: "hiking and camping", platforms: ["instagram", "youtube"], topics: ["outdoor"] },
  { handle: "@kai.plays", niche: "indie games", platforms: ["youtube", "tiktok"], topics: ["gaming"] },
  { handle: "@amara.money", niche: "personal finance", platforms: ["x", "instagram"], topics: ["finance"] },
  { handle: "@juno.skin", niche: "skincare routines", platforms: ["tiktok", "instagram"], topics: ["beauty", "lifestyle"] },
  { handle: "@felix.commutes", niche: "urban mobility", platforms: ["youtube", "x"], topics: ["mobility", "tech"] },
  { handle: "@rae.interiors", niche: "small-space interiors", platforms: ["instagram", "tiktok"], topics: ["lifestyle"] },
  { handle: "@bo.lifts", niche: "strength training", platforms: ["tiktok", "youtube"], topics: ["fitness"] },
  { handle: "@ivy.reads", niche: "book reviews", platforms: ["x", "instagram"], topics: ["books", "lifestyle"] },
];

/** Escrow bands per brand tier, in whole GEN. Realistic sponsorship spread:
 *  a coffee roaster and a fintech do not pay the same rate. */
const TIER_RANGE = { low: [0.05, 0.9], mid: [0.6, 2.5], high: [1.5, 6] };

const PLATFORM_LABEL = {
  x: "X (Twitter)",
  instagram: "Instagram",
  youtube: "YouTube",
  tiktok: "TikTok",
};

const FORMATS = {
  x: ["thread", "single post"],
  instagram: ["in-feed reel", "carousel post", "single photo post"],
  youtube: ["integrated segment", "dedicated review video"],
  tiktok: ["short-form video", "duet-style demo"],
};

/**
 * Public URLs used for `submit_post`. They must sit on the platform's real
 * domain — the contract checks the host, client-side rules or not.
 *
 * These are ordinary public pages. Whether the GenVM render engine can read
 * one is exactly what decides SUBMITTED vs VERIFYING vs GRACE_PERIOD, and it
 * varies per page and per run: that unpredictability is real behaviour, not a
 * limitation of the seed.
 */
const POST_URLS = {
  youtube: [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=9bZkp7q19f0",
    "https://www.youtube.com/watch?v=jNQXAC9IVRw",
    "https://www.youtube.com/watch?v=kJQP7kiw5Fk",
    "https://youtu.be/hY7m5jjJ9mM",
    "https://www.youtube.com/watch?v=RgKAFK5djSk",
  ],
  x: [
    "https://x.com/GenLayer/status/1815234567890123456",
    "https://x.com/maya_builds/status/1822910334455667788",
    "https://twitter.com/nadia_codes/status/1809556677889900112",
    "https://x.com/amara_money/status/1831447788990011223",
    "https://x.com/devwithjules/status/1826778899001122334",
  ],
  instagram: [
    "https://www.instagram.com/p/C8kZq2xNvQe/",
    "https://www.instagram.com/p/C9pLm4tRbYh/",
    "https://www.instagram.com/reel/C7yTn1sKxWd/",
    "https://www.instagram.com/p/CzR4v8mLpQa/",
    "https://www.instagram.com/reel/DA2hB6nJkTf/",
  ],
  tiktok: [
    "https://www.tiktok.com/@khaby.lame/video/7137423965982440709",
    "https://www.tiktok.com/@lena.fit/video/7291884455667788990",
    "https://www.tiktok.com/@juno.skin/video/7314556677889900112",
    "https://www.tiktok.com/@bo.lifts/video/7268990011223344556",
  ],
};

// ---------------------------------------------------------------- terms
//
// Two flavours, both written the way a real brief is.
//
// A "content" brief lists concrete, checkable deliverables (a mention, a
// hashtag, a link). The judge derives one check per line and grades what the
// page actually shows, so these mostly do NOT pass on a page the render engine
// only partially retrieves — they land in GRACE_PERIOD with a real reason
// attached, which is the state most worth having in a demo dataset.
//
// An "availability" brief is the shape used by seeding and awareness deals
// where the deliverable is placement rather than wording. Its requirements are
// satisfiable from the page itself, so these are the ones that can reach
// VERIFYING.

function contentTerms(brand, creator, platform, days) {
  const format = pick(FORMATS[platform]);
  const [tagA, tagB] = brand.tags;
  const lines = [
    `CAMPAIGN BRIEF: ${brand.name} x ${creator.handle}`,
    `Deliverable: one original ${format} on ${PLATFORM_LABEL[platform]}, produced by the creator.`,
    "",
    "REQUIREMENTS",
    `1. Mention ${brand.name} by name and tag ${brand.handle} in the post.`,
    `2. Include the hashtags ${tagA} and ${tagB} so the partnership is disclosed.`,
    `3. Point viewers to ${brand.site} in the caption, description or on screen.`,
    `4. The post must be original, not a reply, quote or repost of someone else.`,
    `5. Keep the post public and unedited for at least ${days} days.`,
    "",
    "TONE",
    `Speak to a ${creator.niche} audience in the creator's own voice. No claims about`,
    `medical, financial or performance outcomes that ${brand.name} has not published.`,
    "",
    "SETTLEMENT",
    "Escrow releases to the creator once validators confirm the live post still",
    "meets every requirement above at the end of the live window.",
  ];
  return lines.join("\n");
}

function availabilityTerms(brand, creator, platform, days) {
  const format = pick(FORMATS[platform]);
  const lines = [
    `CAMPAIGN BRIEF: ${brand.name} placement with ${creator.handle}`,
    `Deliverable: one ${format} on ${PLATFORM_LABEL[platform]} for the ${brand.name} launch window.`,
    "",
    "REQUIREMENTS",
    "1. The sponsored post must be live and publicly viewable at the submitted URL.",
    `2. The post must stay online and reachable for the full ${days} day live window.`,
    "",
    "NOTES",
    `Creative direction is the creator's own; ${brand.name} reviewed the concept before`,
    `booking. Reach reporting is handled off chain and is not a settlement condition.`,
    "",
    "SETTLEMENT",
    "Escrow releases to the creator once validators confirm the post is still live",
    "at the end of the window.",
  ];
  return lines.join("\n");
}

/**
 * Mirror of the contract's `_check_terms_safe` plus its length bounds.
 *
 * Sending terms the contract rejects would burn a transaction and leave a gap
 * in the book, so every brief is validated locally before it is signed. This
 * is the same client-side/contract-side mirroring the URL rules already use.
 */
// Written as escapes for the same reason the contract writes them as escapes:
// spelled literally, the list itself is invisible to whoever reviews it.
const INVISIBLE =
  /[\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u2064\u2066-\u2069\ufeff\x7f]/;
function assertTermsSafe(terms) {
  if (terms.length < 50 || terms.length > 4000)
    throw new Error(`terms must be 50-4000 chars, got ${terms.length}`);
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(terms))
    throw new Error("terms contain control characters");
  if (INVISIBLE.test(terms)) throw new Error("terms contain invisible characters");
  if (/(<{3,}|>{3,}|-{3,})/.test(terms))
    throw new Error("terms contain a prompt delimiter run");
  return terms;
}

// ---------------------------------------------------------------- chain

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Read client: views need no funded account, so one throwaway is enough. */
const readAccount = createAccount(seededPrivateKey());
const readClient = createClient({ chain: studionet, account: readAccount });
const read = (functionName, args) =>
  readClient.readContract({ address: ADDRESS, functionName, args });

/**
 * The faucet takes a JSON number, so amounts are funded in WHOLE GEN: an
 * integer multiple of 1e18 up to 9e18 is exactly representable as a double,
 * while an arbitrary wei amount is not and would be silently rounded.
 */
const FUND_CHUNK_GEN = 8;
async function fundTo(addr, targetWei) {
  for (let round = 0; round < 30; round++) {
    const bal = BigInt(await readClient.getBalance({ address: addr }));
    if (bal >= targetWei) return bal;
    const shortGen = Number((targetWei - bal + GEN - 1n) / GEN);
    const chunk = Math.min(FUND_CHUNK_GEN, Math.max(1, shortGen));
    await rpc("sim_fundAccount", [addr, chunk * 1e18]);
    await sleep(1200);
  }
  throw new Error(`account ${addr} never reached ${targetWei} wei`);
}

const RESULT_CODES = { 1: "rollback", 2: "contract_error", 3: "error" };
const ERROR_STATUSES = new Set(["rollback", "contract_error", "error"]);

/**
 * A GenVM revert still reaches ACCEPTED consensus, so a failed call arrives as
 * a receipt, not a throw. Treating "accepted" as "worked" is how a seeder ends
 * up reporting deals it never created. Mirrors extractGenVmError in
 * apps/web/src/lib/contract.ts.
 */
function revertReason(receipt) {
  const r = leaderReceipt(receipt);
  const result = r?.result;
  if (typeof result === "string" && result) {
    try {
      const bin = Buffer.from(result, "base64");
      const status = RESULT_CODES[bin[0]];
      if (status) return bin.subarray(1).toString("utf8") || status;
    } catch {
      /* not base64 */
    }
  } else if (result && typeof result === "object" && ERROR_STATUSES.has(String(result.status))) {
    return typeof result.payload === "string" && result.payload ? result.payload : String(result.status);
  }
  if (/^(ERROR|FINISHED_WITH_ERROR)$/i.test(r?.execution_result ?? "")) return "execution failed";
  if (receipt?.txExecutionResultName === "FINISHED_WITH_ERROR") return "execution failed";
  return null;
}

/**
 * The receipt that actually decides the call's outcome.
 *
 * `consensus_data.leader_receipt` is NOT a list of leaders — it holds the
 * leader's receipt AND the validators' receipts from the round. A validator
 * that times out reveals `vote: "idle"` with `result` = contract_error("idle"),
 * which is a statement about that node, not about the call: consensus can still
 * land MAJORITY_AGREE and the write still commits. Scanning the whole array for
 * an error therefore reports perfectly good transactions as reverted — three
 * of them did exactly that on the first run of this script. Only the entry with
 * `mode: "leader"` carries the execution result, so that is the one read here,
 * with the first entry as the fallback for shapes that omit `mode`.
 */
function leaderReceipt(receipt) {
  const lr = receipt?.consensus_data?.leader_receipt ?? receipt?.data?.leader_receipt;
  const list = Array.isArray(lr) ? lr : lr ? [lr] : [];
  return list.find((r) => r?.mode === "leader") ?? list[0] ?? null;
}

/** The value a `@gl.public.write` returned, when the receipt carries one. */
function returnedValue(receipt) {
  const result = leaderReceipt(receipt)?.result;
  if (result && typeof result === "object" && result.status === "return") {
    const readable = result.payload?.readable;
    if (readable != null) return String(readable);
  }
  return null;
}

/**
 * One in-flight transaction per wallet.
 *
 * Two concurrent writes from the same address race on the nonce, and a persona
 * that runs several campaigns will be picked more than once. Serializing per
 * sender keeps the concurrency where it belongs — across personas — without
 * making the book look like one machine talking to itself.
 */
const walletQueues = new Map();
function withWallet(addr, fn) {
  const prev = walletQueues.get(addr) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  walletQueues.set(
    addr,
    run.then(
      () => {},
      () => {}
    )
  );
  return run;
}

const stats = { sent: 0, reverted: 0, failed: 0 };

/**
 * Sign, send, and wait for consensus.
 *
 * Only SUBMISSION is retried, and only while it has produced no hash. Once the
 * transaction is on the wire, retrying the write would sign a second one — a
 * duplicate bond and a second escrow — so a slow receipt is waited out again
 * against the SAME hash instead. A revert is not retried at all: it is the
 * contract's verdict about the call, and it is returned to the caller.
 */
async function send(persona, functionName, args, value = 0n) {
  return withWallet(persona.address, async () => {
    // Human pacing. A seed that fires everything in one burst reads as a
    // script in the explorer; real bonds arrive spread out.
    await sleep(randInt(250, 1500));

    let hash;
    let lastErr;
    for (let attempt = 0; attempt < 3 && !hash; attempt++) {
      try {
        hash = await persona.client.writeContract({ address: ADDRESS, functionName, args, value });
      } catch (e) {
        lastErr = e;
        await sleep(2000 * (attempt + 1));
      }
    }
    if (!hash) {
      stats.failed++;
      throw new Error(`${functionName}: never submitted — ${lastErr?.message ?? lastErr}`);
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const receipt = await persona.client.waitForTransactionReceipt({
          hash,
          status: TransactionStatus.ACCEPTED,
          retries: 200,
          interval: 3000,
        });
        stats.sent++;
        const reason = revertReason(receipt);
        if (reason) stats.reverted++;
        return { hash, receipt, reason, value: returnedValue(receipt) };
      } catch (e) {
        lastErr = e;
        await sleep(3000);
      }
    }
    stats.failed++;
    throw new Error(`${functionName} (${hash}): no receipt — ${lastErr?.message ?? lastErr}`);
  });
}

/** Bounded-parallelism map that never rejects: a broken action is recorded. */
async function pool(items, size, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      try {
        results[i] = { ok: true, value: await worker(items[i], i) };
      } catch (e) {
        results[i] = { ok: false, error: e };
      }
    }
  });
  await Promise.all(runners);
  return results;
}

// ---------------------------------------------------------------- planning

/**
 * Split the transaction budget across the action mix.
 *
 * Follow-ups can never outnumber the deals they act on, and every deal takes
 * at most one, so the deal share is raised until the plan is consistent.
 */
function planBudget(budget) {
  let deals = Math.max(4, Math.round(budget * 0.56));
  let follow = budget - deals;
  if (follow > deals) {
    deals = Math.ceil(budget / 2);
    follow = budget - deals;
  }
  const submits = Math.round(follow * 0.66);
  const declines = Math.round(follow * 0.19);
  const cancels = Math.max(0, follow - submits - declines);
  return { deals, submits, declines, cancels };
}

const budget = planBudget(TX_BUDGET);

/** Persona -> funded wallet, minted once and reused across their campaigns. */
function makeWallet(profile) {
  const key = seededPrivateKey();
  const account = createAccount(key);
  return {
    ...profile,
    key,
    address: account.address,
    client: createClient({ chain: studionet, account }),
  };
}

const brands = BRANDS.map(makeWallet);
const creators = CREATORS.map(makeWallet);

function escrowFor(tier) {
  const [lo, hi] = TIER_RANGE[tier];
  // Two decimals of GEN: sponsorships are quoted in round-ish numbers.
  const gen = Math.round(rand(lo, hi) * 100) / 100;
  return BigInt(Math.round(gen * 100)) * (GEN / 100n);
}

/**
 * Brands mostly book creators whose audience matches the product, and
 * occasionally take a flyer on one who does not. A book where a fintech pays a
 * skincare creator on every other row does not read as real matchmaking, and a
 * book with zero crossover does not either.
 */
function pickCreatorFor(brand) {
  const onTopic = creators.filter((c) => c.topics.some((t) => brand.topics.includes(t)));
  return onTopic.length && chance(0.8) ? pick(onTopic) : pick(creators);
}

const EXTERNAL = args.forAddress
  ? { handle: "your wallet", address: args.forAddress, external: true }
  : null;

const dealPlan = [];
for (let i = 0; i < budget.deals; i++) {
  const brand = pick(brands);
  // Every sixth-ish bond goes to the wallet the operator asked for, so their
  // creator dashboard has real incoming offers. We hold no key for it, so it
  // can never be picked for a submission or a decline.
  const toExternal = EXTERNAL && chance(0.16);
  const creator = toExternal ? EXTERNAL : pickCreatorFor(brand);
  const platform = toExternal
    ? pick(["x", "instagram", "youtube", "tiktok"])
    : pick(creator.platforms);
  const days = pick([1, 2, 3, 3, 5, 7, 7, 10, 14, 21, 30]);
  const flavour = chance(0.35) ? "availability" : "content";
  const terms = assertTermsSafe(
    (flavour === "availability" ? availabilityTerms : contentTerms)(
      brand,
      creator,
      platform,
      days
    )
  );
  dealPlan.push({
    brand,
    creator,
    platform,
    days,
    flavour,
    terms,
    amount: escrowFor(brand.tier),
  });
}

const fmtGen = (wei) => `${(Number(wei) / 1e18).toFixed(2)} GEN`;

// ---------------------------------------------------------------- preflight

const totalEscrow = dealPlan.reduce((a, d) => a + d.amount, 0n);

console.log("HypeBond seeder");
console.log(`  contract     ${ADDRESS}  (${studionet.name})`);
console.log(`  rng seed     ${SEED}   (rerun with --seed ${SEED} to reproduce)`);
console.log(
  `  plan         ${budget.deals} create_deal, ${budget.submits} submit_post, ` +
    `${budget.declines} decline_deal, ${budget.cancels} cancel_deal ` +
    `= ${budget.deals + budget.submits + budget.declines + budget.cancels} transactions`
);
console.log(`  escrow       ${fmtGen(totalEscrow)} across ${new Set(dealPlan.map((d) => d.brand.address)).size} brand wallets`);
console.log(`  concurrency  ${CONCURRENCY}`);
if (EXTERNAL) console.log(`  addressed to ${EXTERNAL.address} where the plan says so`);
console.log("");

if (args.dryRun) {
  for (const [i, d] of dealPlan.entries()) {
    console.log(
      `  ${String(i + 1).padStart(3)}. ${d.brand.name} -> ${d.creator.handle} ` +
        `${fmtGen(d.amount)} on ${d.platform}, ${d.days}d, ${d.flavour} brief`
    );
  }
  console.log("\n(dry run: nothing was sent)");
  process.exit(0);
}

if (!args.yes && process.stdin.isTTY) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    `Send ${budget.deals + budget.submits + budget.declines + budget.cancels} real transactions to ${ADDRESS}? [y/N] `
  );
  rl.close();
  if (!/^y(es)?$/i.test(answer.trim())) {
    console.log("aborted");
    process.exit(0);
  }
}

const startedAt = Date.now();
const elapsed = () => `${((Date.now() - startedAt) / 1000).toFixed(0)}s`;

// ---------------------------------------------------------------- funding

const needed = new Map();
const bump = (w, wei) => needed.set(w, (needed.get(w) ?? 0n) + wei);
// Gas headroom. Studio gas is nominal; 1 GEN per wallet is plenty and keeps
// the faucet call count down.
const GAS_BUFFER = GEN;
for (const d of dealPlan) bump(d.brand, d.amount);
for (const w of [...brands, ...creators]) bump(w, GAS_BUFFER);

const fundList = [...needed.entries()].filter(([w]) => !w.external);
console.log(`Funding ${fundList.length} persona wallets…`);
const funded = await pool(fundList, CONCURRENCY, async ([wallet, target]) => {
  await fundTo(wallet.address, target);
});
const fundFails = funded.filter((r) => !r.ok);
if (fundFails.length) {
  for (const f of fundFails) console.error(`  faucet: ${f.error?.message ?? f.error}`);
  die("could not fund every persona — the faucet is unhappy, nothing was seeded");
}
console.log(`  funded in ${elapsed()}\n`);

// ---------------------------------------------------------------- create

console.log(`Creating ${dealPlan.length} bonds…`);
const created = [];
const claimed = new Set();

/**
 * Fallback when a receipt carries no readable return value.
 *
 * `create_deal` returns the new id, but a receipt shape this script cannot
 * decode would otherwise orphan a bond that really exists — paid for, indexed,
 * and invisible to the manifest. The brand's own index is authoritative, and
 * writes are serialized per wallet, so the highest id in it that no earlier
 * deal has claimed is this call's.
 */
async function newestUnclaimedDealId(brand) {
  const ids = [];
  for (let offset = 0; offset < 500; offset += 50) {
    const page = await read("get_brand_deals", [brand.address, BigInt(offset), 50n]);
    if (!Array.isArray(page) || page.length === 0) break;
    ids.push(...page.map((d) => Number(d.id)));
    if (page.length < 50) break;
  }
  const fresh = ids.filter((id) => !claimed.has(id)).sort((a, b) => b - a);
  return fresh[0] ?? 0;
}
await pool(dealPlan, CONCURRENCY, async (plan) => {
  const res = await send(
    plan.brand,
    "create_deal",
    [plan.creator.address, plan.terms, plan.platform, plan.days],
    plan.amount
  );
  if (res.reason) {
    console.log(`  x  ${plan.brand.name} -> ${plan.creator.handle}: ${res.reason.slice(0, 90)}`);
    return;
  }
  const id = Number.isInteger(Number(res.value)) && Number(res.value) > 0
    ? Number(res.value)
    : await newestUnclaimedDealId(plan.brand);
  if (!id) {
    console.log(`  ?  ${plan.brand.name} -> ${plan.creator.handle}: created, but the id is unreadable`);
    return;
  }
  claimed.add(id);
  created.push({ ...plan, id, createHash: res.hash });
  console.log(
    `  ok deal ${String(id).padStart(3)}  ${plan.brand.name} -> ${plan.creator.handle}  ` +
      `${fmtGen(plan.amount)}  ${plan.platform} ${plan.days}d  [${elapsed()}]`
  );
});
console.log(`  ${created.length}/${dealPlan.length} bonds created in ${elapsed()}\n`);

// ---------------------------------------------------------------- follow-ups
//
// Assigned against what actually exists on-chain, not against the plan: a
// create that reverted must not leave a submission pointing at nothing. Deals
// addressed to `--for` are excluded from anything needing the creator's key.

const ours = shuffled(created.filter((d) => !d.creator.external));
const theirs = shuffled(created.filter((d) => d.creator.external));

const submitFor = ours.slice(0, budget.submits);
const declineFor = ours.slice(budget.submits, budget.submits + budget.declines);
const cancelPool = shuffled([...ours.slice(budget.submits + budget.declines), ...theirs]);
const cancelFor = cancelPool.slice(0, budget.cancels);

if (submitFor.length) {
  console.log(
    `Submitting ${submitFor.length} posts (each runs a live fetch + consensus round, ~40-70s)…`
  );
  await pool(submitFor, CONCURRENCY, async (deal) => {
    const url = pick(POST_URLS[deal.platform]);
    const res = await send(deal.creator, "submit_post", [deal.id, url]);
    deal.postUrl = url;
    deal.submitHash = res.hash;
    if (res.reason) {
      console.log(`  x  deal ${deal.id}: ${res.reason.slice(0, 90)}`);
      return;
    }
    const after = await read("get_deal", [BigInt(deal.id)]);
    deal.status = after?.status;
    console.log(
      `  ok deal ${String(deal.id).padStart(3)}  ${deal.creator.handle} submitted -> ${after?.status}  [${elapsed()}]`
    );
  });
  console.log("");
}

if (declineFor.length) {
  console.log(`Declining ${declineFor.length} bonds (this really refunds the brand)…`);
  await pool(declineFor, CONCURRENCY, async (deal) => {
    const res = await send(deal.creator, "decline_deal", [deal.id]);
    deal.declineHash = res.hash;
    if (res.reason) console.log(`  x  deal ${deal.id}: ${res.reason.slice(0, 90)}`);
    else console.log(`  ok deal ${String(deal.id).padStart(3)}  ${deal.creator.handle} declined  [${elapsed()}]`);
  });
  console.log("");
}

if (cancelFor.length) {
  console.log(`Opening ${cancelFor.length} cancellation notices (24h public notice, not a cancel)…`);
  await pool(cancelFor, CONCURRENCY, async (deal) => {
    const res = await send(deal.brand, "cancel_deal", [deal.id]);
    deal.cancelHash = res.hash;
    if (res.reason) console.log(`  x  deal ${deal.id}: ${res.reason.slice(0, 90)}`);
    else console.log(`  ok deal ${String(deal.id).padStart(3)}  ${deal.brand.name} opened notice  [${elapsed()}]`);
  });
  console.log("");
}

// ---------------------------------------------------------------- report

console.log("Reading the book back from chain…");
const final = [];
for (const deal of created) {
  const d = await read("get_deal", [BigInt(deal.id)]);
  if (d) final.push({ ...deal, chain: d });
}

const byStatus = {};
let escrowLive = 0n;
for (const d of final) {
  const key =
    d.chain.status === "FUNDED" && Number(d.chain.cancel_requested_at) > 0
      ? "FUNDED (cancel notice open)"
      : d.chain.status;
  byStatus[key] = (byStatus[key] ?? 0) + 1;
  if (!d.chain.settled) escrowLive += BigInt(d.chain.amount);
}

const outDir = join(here, "..", ".seed");
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, `seed-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(
  outFile,
  JSON.stringify(
    {
      contract: ADDRESS,
      network: NETWORK,
      rngSeed: SEED,
      seededAt: new Date().toISOString(),
      transactions: stats,
      wallets: [...brands, ...creators].map((w) => ({
        role: w.name ? "brand" : "creator",
        name: w.name ?? w.handle,
        address: w.address,
        privateKey: w.key,
      })),
      deals: final.map((d) => ({
        id: d.id,
        brand: d.brand.name,
        brandAddress: d.brand.address,
        creator: d.creator.handle,
        creatorAddress: d.creator.address,
        platform: d.platform,
        minLiveDays: d.days,
        amountWei: String(d.amount),
        status: d.chain.status,
        settled: d.chain.settled,
        postUrl: d.postUrl ?? "",
        verdictReason: d.chain.verdict_reason,
        txs: {
          create: d.createHash,
          submit: d.submitHash,
          decline: d.declineHash,
          cancel: d.cancelHash,
        },
      })),
    },
    null,
    2
  )
);

const total = Number(await read("get_deal_count", []));
console.log("");
console.log("Seeded.");
console.log(`  transactions   ${stats.sent} accepted (${stats.reverted} reverted, ${stats.failed} never landed)`);
console.log(`  bonds created  ${final.length}   contract now holds ${total} deals in total`);
console.log(`  escrow live    ${fmtGen(escrowLive)} still bonded`);
console.log(`  wall clock     ${elapsed()}`);
console.log("");
console.log("  status distribution");
for (const [k, v] of Object.entries(byStatus).sort((a, b) => b[1] - a[1]))
  console.log(`    ${String(v).padStart(3)}  ${k}`);
console.log("");
console.log(`  manifest       ${relative(repoRoot, outFile)}`);

const showcase = final.find((d) => d.chain.status === "VERIFYING") ?? final[0];
if (showcase) console.log(`  try it         /deal/${showcase.id}`);

const persona = brands.find((b) => final.some((d) => d.brand.address === b.address));
if (persona) {
  console.log("");
  console.log(`  To browse as ${persona.name}, paste this in the app's console and reload:`);
  console.log(
    `    localStorage.setItem("hypebond.burnerKey","${persona.key}");` +
      `localStorage.setItem("hypebond.wallet","burner")`
  );
}

process.exit(stats.failed > 0 ? 1 : 0);
