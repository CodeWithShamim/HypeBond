/**
 * Types mirroring the HypeBond contract state (packages/contracts/hypebond.py),
 * plus the terms-builder and platform URL rules shared by the UI and (in
 * mirrored form) the contract. View methods return plain dicts of
 * str/int/bool — ints may arrive from genlayer-js as number OR bigint, so
 * escrow amounts are normalized to bigint and small ints to number.
 */

// ---------------------------------------------------------------- statuses

export const DEAL_STATUSES = [
  "FUNDED", // escrow locked, waiting for the influencer to post
  "SUBMITTED", // URL submitted, initial AI check pending/errored (retryable)
  "GRACE_PERIOD", // initial check failed — influencer has 48h to fix/repost
  "VERIFYING", // initial check passed — waiting out the live-days window
  "PAID", // final verification passed, escrow released to influencer
  "VERIFIED_FAIL", // final verification failed, escrow refunded to brand
  "REFUNDED", // escrow reclaimed for the brand via timeout
  "CANCELLED", // brand cancelled before any post was submitted
  "DECLINED", // creator refused the deal, brand refunded on the spot
] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

/** Statuses where the deal is still in motion (worth polling). */
export const LIVE_STATUSES: readonly DealStatus[] = [
  "FUNDED",
  "SUBMITTED",
  "GRACE_PERIOD",
  "VERIFYING",
];

/** Terminal statuses where the escrow has moved and nothing can change. */
export const SETTLED_STATUSES: readonly DealStatus[] = [
  "PAID",
  "VERIFIED_FAIL",
  "REFUNDED",
  "CANCELLED",
  "DECLINED",
];

// ---------------------------------------------------------------- platforms

export const PLATFORMS = ["x", "instagram", "youtube", "tiktok"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  x: "X (Twitter)",
  instagram: "Instagram",
  youtube: "YouTube",
  tiktok: "TikTok",
};

/** Must stay in lockstep with PLATFORM_DOMAINS in hypebond.py. */
export const PLATFORM_DOMAINS: Record<Platform, string[]> = {
  x: ["x.com", "twitter.com"],
  instagram: ["instagram.com"],
  youtube: ["youtube.com", "youtu.be"],
  tiktok: ["tiktok.com"],
};

export const MAX_URL_CHARS = 500;

/**
 * Characters the contract permits in a submitted URL (RFC 3986 unreserved +
 * reserved + "%"). Must stay in lockstep with URL_SAFE_CHARS in hypebond.py —
 * the contract rejects everything else, so accepting more here just produces
 * a confusing on-chain revert instead of an inline form error.
 */
const URL_SAFE_RE = /^[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+$/;
const HOST_SAFE_RE = /^[a-z0-9-.]+$/;

/**
 * Client-side mirror of the contract's URL check: https, safe characters
 * only, and a host on the platform's domain.
 *
 * Note this deliberately does NOT lean on `new URL()` alone — the contract
 * parses the authority by hand, and a URL the browser normalizes (e.g. one
 * containing "\") could otherwise look valid here and revert on-chain.
 */
export function isValidPostUrl(url: string, platform: Platform): boolean {
  if (url.length > MAX_URL_CHARS) return false;
  if (!url.startsWith("https://")) return false;
  if (!URL_SAFE_RE.test(url)) return false;

  const rest = url.slice("https://".length);
  const authority = rest.split("/", 1)[0].split("?", 1)[0].split("#", 1)[0];
  let host = authority.split("@").pop()!.split(":", 1)[0].toLowerCase();
  if (host.startsWith("www.")) host = host.slice(4);
  if (!host || !HOST_SAFE_RE.test(host)) return false;

  return PLATFORM_DOMAINS[platform].some(
    (d) => host === d || host.endsWith("." + d)
  );
}

/**
 * Prompt-structure markers the contract refuses inside deal terms. Terms sit
 * in a delimited region of the judging prompt; text that closes that region
 * early could script the verdict, so `create_deal` reverts on these.
 */
const PROMPT_MARKERS = [
  "<<<page>>>",
  "<<<end page>>>",
  "--- begin deal terms ---",
  "--- end deal terms ---",
];

/**
 * Every marker above is built from a run of one delimiter character. The
 * contract rejects the RUNS rather than the literal markers, because a model
 * reads "<<<END  PAGE>>>" and "<<< end page >>>" as the same terminator that
 * "<<<END PAGE>>>" is. Must stay in lockstep with DELIM_RUN_CHARS /
 * DELIM_RUN_MIN in hypebond.py.
 */
const DELIM_RUN_RE = /<{3,}|>{3,}|-{3,}/;

/**
 * Zero-width, bidi-control and separator code points the contract rejects in
 * terms: invisible to a reader, real tokens to the judging model. Must stay
 * in lockstep with INVISIBLE_CHARS in hypebond.py.
 */
const INVISIBLE_RE =
  /[\u00ad\u061c\u180e\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff\u007f]/;

/**
 * Mirror of the contract's `_check_terms_safe`. Returns an error string, or
 * null when the terms are acceptable.
 */
export function termsProblem(terms: string): string | null {
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000B-\u001F]/.test(terms))
    return "Terms contain unsupported control characters.";
  if (INVISIBLE_RE.test(terms))
    return "Terms contain invisible or bidirectional characters.";
  if (DELIM_RUN_RE.test(terms))
    return "Terms may not contain prompt delimiter markers (<<<, >>> or ---).";
  const flat = terms.toLowerCase().split(/\s+/).join(" ");
  if (PROMPT_MARKERS.some((m) => flat.includes(m)))
    return "Terms may not contain prompt delimiter markers.";
  return null;
}

// ---------------------------------------------------------------- deal

export interface Deal {
  id: number;
  brand: string;
  influencer: string;
  amount: bigint; // escrowed native token amount (wei)
  terms: string;
  post_url: string;
  platform: Platform;
  min_live_days: number;
  created_at: number;
  submitted_at: number;
  first_submitted_at: number; // first-ever submission — anchors the stale clock
  verify_after: number;
  grace_until: number;
  last_check_at: number;
  cancel_requested_at: number; // brand's cancellation notice opened (0 = none)
  unreachable_since: number; // first unfetchable final check (0 = reachable)
  status: DealStatus;
  verdict_reason: string;
  checks_passed: string; // JSON string of per-criterion results
  settled: boolean;
}

export interface VerdictCheck {
  requirement: string;
  passed: boolean;
  evidence: string;
}

export interface Verdict {
  exists: boolean;
  checks: VerdictCheck[];
  overall_pass: boolean;
  reason: string;
}

/** Parse the on-chain checks_passed JSON defensively. */
export function parseVerdict(raw: string): Verdict | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    const checks = Array.isArray(v.checks)
      ? (v.checks as Record<string, unknown>[]).map((c) => ({
          requirement: typeof c.requirement === "string" ? c.requirement : "",
          passed: c.passed === true,
          evidence: typeof c.evidence === "string" ? c.evidence : "",
        }))
      : [];
    return {
      exists: v.exists === true,
      checks,
      overall_pass: v.overall_pass === true,
      reason: typeof v.reason === "string" ? v.reason : "",
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- parsing

type Raw = Record<string, unknown>;

function big(v: unknown): bigint {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(Math.trunc(v));
  if (typeof v === "string" && /^\d+$/.test(v)) return BigInt(v);
  return 0n;
}

function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
  return 0;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function bool(v: unknown): boolean {
  return v === true || v === 1 || v === 1n;
}

/** genlayer-js may decode calldata maps as Map instead of plain object. */
function toRaw(v: unknown): Raw | null {
  if (v instanceof Map) return Object.fromEntries(v.entries()) as Raw;
  if (typeof v === "object" && v !== null && !Array.isArray(v)) return v as Raw;
  return null;
}

function dealStatus(v: unknown): DealStatus {
  const s = str(v);
  return (DEAL_STATUSES as readonly string[]).includes(s)
    ? (s as DealStatus)
    : "FUNDED";
}

function platform(v: unknown): Platform {
  const s = str(v);
  return (PLATFORMS as readonly string[]).includes(s) ? (s as Platform) : "x";
}

export function parseDeal(v: unknown): Deal | null {
  const r = toRaw(v);
  if (!r || r.id === undefined) return null;
  return {
    id: num(r.id),
    brand: str(r.brand),
    influencer: str(r.influencer),
    amount: big(r.amount),
    terms: str(r.terms),
    post_url: str(r.post_url),
    platform: platform(r.platform),
    min_live_days: num(r.min_live_days),
    created_at: num(r.created_at),
    submitted_at: num(r.submitted_at),
    first_submitted_at: num(r.first_submitted_at),
    verify_after: num(r.verify_after),
    grace_until: num(r.grace_until),
    last_check_at: num(r.last_check_at),
    cancel_requested_at: num(r.cancel_requested_at),
    unreachable_since: num(r.unreachable_since),
    status: dealStatus(r.status),
    verdict_reason: str(r.verdict_reason),
    checks_passed: str(r.checks_passed),
    settled: bool(r.settled),
  };
}

export function parseDealList(v: unknown): Deal[] {
  if (!Array.isArray(v)) return [];
  return v.map(parseDeal).filter((d): d is Deal => d !== null);
}

// ---------------------------------------------------------------- terms builder

export interface TermsConfig {
  platform: Platform;
  mentions: string[]; // "@BrandName" handles
  hashtags: string[]; // "#Campaign" tags
  link: string; // required link, e.g. "brandsite.com" ("" = none)
  tone: boolean; // require positive/neutral tone
  originalOnly: boolean; // no replies/reposts
  minLiveDays: number;
  extra: string; // free-form extra requirement lines
}

/**
 * Generates the exact structured plain-English terms block stored on-chain.
 * The contract's verification prompt judges the post against this text, so
 * the UI shows a live preview of precisely what this returns.
 */
export function buildTerms(cfg: TermsConfig): string {
  const lines: string[] = ["POST REQUIREMENTS:"];
  lines.push(`- Platform: ${PLATFORM_LABELS[cfg.platform]}`);
  const mentions = cfg.mentions.filter(Boolean);
  const hashtags = cfg.hashtags.filter(Boolean);
  const mentionBits = [...mentions, ...hashtags];
  if (mentionBits.length > 0) {
    lines.push(`- Must mention: ${mentionBits.join(" and ")}`);
  }
  if (cfg.link.trim()) {
    lines.push(`- Must include: a link to ${cfg.link.trim()}`);
  }
  if (cfg.tone) {
    lines.push(
      "- Tone: positive or neutral about the product, no disclaimers mocking it"
    );
  }
  if (cfg.originalOnly) {
    lines.push("- Must be an original post, not a reply or repost");
  }
  lines.push(
    `- Must stay live for at least ${cfg.minLiveDays} day${cfg.minLiveDays === 1 ? "" : "s"}`
  );
  for (const raw of cfg.extra.split("\n")) {
    const line = raw.trim();
    if (line) lines.push(line.startsWith("-") ? line : `- ${line}`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------- helpers

export const SECONDS_PER_DAY = 86400;
/** Brand may reclaim escrow if no post lands within this window. */
export const SUBMIT_WINDOW_DAYS = 14;
/** Influencer's window to fix a failed initial check. */
export const GRACE_HOURS = 48;

/**
 * Anti-spam floor on the escrow, in wei. Mirrors MIN_ESCROW in hypebond.py.
 *
 * `create_deal` appends to the INFLUENCER's index and anyone can name anyone,
 * so without a floor a stranger's dashboard can be buried in dust deals. The
 * escrow is refundable, so this is a capital requirement rather than a fee.
 */
export const MIN_ESCROW_WEI = 10n ** 16n; // 0.01 GEN
export const MIN_ESCROW_LABEL = "0.01";

export const TERMS_MIN = 50;
export const TERMS_MAX = 4000;

/**
 * Largest batch `prune_deals` will walk in one transaction. Mirrors
 * PRUNE_MAX_STEPS in hypebond.py, which clamps anything larger rather than
 * reverting — a public method must never loop over an attacker-chosen length.
 */
export const PRUNE_MAX_STEPS = 200;

/**
 * Escape hatch: how long a check that never reaches a verdict stays retryable
 * before the brand may reclaim. Mirrors STALE_WINDOW in hypebond.py.
 */
export const STALE_WINDOW_DAYS = 14;

/**
 * How long the brand's cancellation notice runs before it can be completed.
 * Mirrors CANCEL_NOTICE in hypebond.py.
 *
 * This window exists because the influencer must publish PUBLICLY before they
 * can submit the URL: an instant cancel would let the brand watch the post go
 * up and pull the escrow. Submitting during the notice voids the cancellation.
 */
export const CANCEL_NOTICE_HOURS = 24;

/**
 * How long a matured notice stays exercisable before it goes stale and the
 * next `cancel_deal` call re-opens a fresh one. Mirrors CANCEL_WINDOW.
 *
 * Without the expiry the notice would defend only its own first 24 hours: a
 * brand could open one on day 0, let it mature, and hold a standing option to
 * cancel the instant they saw the post go live — the exact race the notice
 * exists to prevent.
 */
export const CANCEL_WINDOW_HOURS = 24;

/**
 * How long a post must read unreachable before final verification accepts it
 * as deleted. Mirrors UNREACHABLE_CONFIRM in hypebond.py.
 */
export const UNREACHABLE_CONFIRM_SECONDS = 3600;

/** True when the brand has opened a cancellation notice that has not run out. */
export function cancelPending(d: Deal): boolean {
  return d.status === "FUNDED" && d.cancel_requested_at > 0;
}

/** When a pending cancellation becomes completable, or 0 if none is open. */
export function cancelEffectiveAt(d: Deal): number {
  return d.cancel_requested_at > 0
    ? d.cancel_requested_at + CANCEL_NOTICE_HOURS * 3600
    : 0;
}

/**
 * When a matured notice goes stale, or 0 if none is open. Past this the
 * contract re-opens a fresh notice instead of settling, so the UI must offer
 * "restart cancellation" rather than "complete cancellation".
 */
export type CancelStep = "open" | "waiting" | "ready" | "restart";

export function cancelExpiresAt(d: Deal): number {
  const effective = cancelEffectiveAt(d);
  return effective > 0 ? effective + CANCEL_WINDOW_HOURS * 3600 : 0;
}

/**
 * Which step `cancel_deal` will actually perform at time `nowSec`.
 *
 * - `open`     no notice yet — the call starts one
 * - `waiting`  notice running — the call reverts
 * - `ready`    inside the window — the call settles and refunds
 * - `restart`  window expired — the call opens a FRESH notice, it does not settle
 */
export function cancelStep(d: Deal, nowSec: number): CancelStep {
  if (!cancelPending(d)) return "open";
  if (nowSec < cancelEffectiveAt(d)) return "waiting";
  if (nowSec >= cancelExpiresAt(d)) return "restart";
  return "ready";
}

/**
 * Minimum seconds between AI checks. Mirrors RECHECK_COOLDOWN in
 * hypebond.py, which applies it to BOTH `recheck_post` and `finalize` —
 * each spends a live web fetch plus an LLM consensus round.
 */
export const RECHECK_COOLDOWN_SECONDS = 300;

/**
 * When the next AI check may run, or 0 if none has run yet. Used to disable
 * retry buttons that the contract would reject anyway — a revert still costs
 * the caller gas.
 */
export function checkCooldownUntil(d: Deal): number {
  return d.last_check_at > 0 ? d.last_check_at + RECHECK_COOLDOWN_SECONDS : 0;
}

/** Deadline for the brand's no-submission timeout claim. */
export function submitDeadline(d: Deal): number {
  return d.created_at + SUBMIT_WINDOW_DAYS * SECONDS_PER_DAY;
}

/**
 * When the escrow may be reclaimed for the brand from a deal whose
 * verification never resolved, or null when the status has no stale-timeout
 * path. Mirrors the SUBMITTED / VERIFYING branches of `claim_timeout`.
 *
 * SUBMITTED counts from the FIRST submission, not the latest: the contract
 * anchors it there so resubmitting during grace cannot push the reclaim out.
 *
 * VERIFYING additionally returns null until a finalize has been attempted
 * since the live window ended — see `finalizeAttempted`. A pure clock here
 * would let a silent brand reclaim the escrow from a passing post.
 */
export function staleDeadline(d: Deal): number | null {
  const stale = STALE_WINDOW_DAYS * SECONDS_PER_DAY;
  if (d.status === "SUBMITTED") {
    // Pre-upgrade deals report 0; fall back so they never read as claimable now.
    return (d.first_submitted_at || d.submitted_at) + stale;
  }
  if (d.status === "VERIFYING") {
    return finalizeAttempted(d) ? d.verify_after + stale : null;
  }
  return null;
}

/**
 * True once a finalize has been attempted after the live window closed and
 * failed to settle the deal. `last_check_at` moves on every AI check, and the
 * initial check always predates `verify_after`, so this is exactly the
 * contract's VERIFYING timeout precondition.
 */
export function finalizeAttempted(d: Deal): boolean {
  return d.verify_after > 0 && d.last_check_at >= d.verify_after;
}

// ---------------------------------------------------------------- attention

export type DealRole = "brand" | "influencer";

export interface DealAttention {
  /** Imperative label — what this party should actually do. */
  label: string;
  /** True when inaction from here costs this party the escrow. */
  urgent: boolean;
}

/**
 * What `role` needs to do about this deal right now, or null for "nothing".
 *
 * Every window in this contract runs against a clock, and the party who loses
 * money when one lapses is not always the party watching the page. The most
 * important case is a creator sitting in VERIFYING: their post is live and
 * passing, a finalize was already attempted and errored, and if nobody
 * finalizes before `staleDeadline` the brand may reclaim the escrow. That is
 * a real loss driven purely by not looking, so it must surface on the list
 * view rather than only on a bond page they have no reason to open.
 */
export function dealAttention(
  d: Deal,
  role: DealRole,
  nowSec: number
): DealAttention | null {
  const stale = staleDeadline(d);

  if (role === "influencer") {
    switch (d.status) {
      case "FUNDED":
        return cancelPending(d)
          ? { label: "Cancellation pending — submit to keep it alive", urgent: true }
          : { label: "Post, then submit the URL", urgent: false };
      case "GRACE_PERIOD":
        return nowSec < d.grace_until
          ? { label: "Check failed — fix before the window closes", urgent: true }
          : null; // window gone; the escrow is the brand's to reclaim
      case "SUBMITTED":
        return nowSec >= checkCooldownUntil(d)
          ? { label: "Check stalled — re-run it", urgent: false }
          : null;
      case "VERIFYING":
        if (nowSec < d.verify_after) return null;
        return stale !== null
          ? { label: "Finalize now or the brand can reclaim", urgent: true }
          : { label: "Live window over — finalize to get paid", urgent: false };
      default:
        return null;
    }
  }

  switch (d.status) {
    case "FUNDED":
      if (cancelStep(d, nowSec) === "ready")
        return { label: "Cancellation ready to complete", urgent: false };
      return nowSec >= submitDeadline(d)
        ? { label: "No post in 14 days — reclaim the escrow", urgent: false }
        : null;
    case "GRACE_PERIOD":
      return nowSec >= d.grace_until
        ? { label: "Fix window lapsed — reclaim the escrow", urgent: false }
        : null;
    case "SUBMITTED":
    case "VERIFYING":
      if (stale !== null && nowSec >= stale)
        return { label: "Verification stalled — reclaim the escrow", urgent: false };
      if (d.status === "VERIFYING" && nowSec >= d.verify_after)
        return { label: "Live window over — finalize", urgent: false };
      return null;
    default:
      return null;
  }
}

/** Settled bonds sitting in an index, which `prune_deals` can compact away. */
export function prunableCount(deals: Deal[]): number {
  return deals.filter((d) => SETTLED_STATUSES.includes(d.status)).length;
}

/** Bond serial rendered like HB-000042. */
export function dealSerial(id: number): string {
  return `HB-${String(id).padStart(6, "0")}`;
}
