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
  "REFUNDED", // brand reclaimed escrow via timeout
  "CANCELLED", // brand cancelled before any post was submitted
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

/** Client-side mirror of the contract's URL check: https + platform domain. */
export function isValidPostUrl(url: string, platform: Platform): boolean {
  if (!url.startsWith("https://")) return false;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (host.startsWith("www.")) host = host.slice(4);
  return PLATFORM_DOMAINS[platform].some(
    (d) => host === d || host.endsWith("." + d)
  );
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
  verify_after: number;
  grace_until: number;
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
    verify_after: num(r.verify_after),
    grace_until: num(r.grace_until),
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

export const TERMS_MIN = 50;
export const TERMS_MAX = 4000;

/** Deadline for the brand's no-submission timeout claim. */
export function submitDeadline(d: Deal): number {
  return d.created_at + SUBMIT_WINDOW_DAYS * SECONDS_PER_DAY;
}

/** Bond serial rendered like HB-000042. */
export function dealSerial(id: number): string {
  return `HB-${String(id).padStart(6, "0")}`;
}
