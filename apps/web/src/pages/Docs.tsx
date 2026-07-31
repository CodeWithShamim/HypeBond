import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  DEAL_STATUSES,
  GRACE_HOURS,
  PLATFORM_DOMAINS,
  PLATFORM_LABELS,
  PLATFORMS,
  RECHECK_COOLDOWN_SECONDS,
  STALE_WINDOW_DAYS,
  SUBMIT_WINDOW_DAYS,
  TERMS_MAX,
  TERMS_MIN,
  type DealStatus,
} from "@hypebond/shared";
import { PageItem } from "@/components/motion/PageTransition";
import { Button, SectionTitle, StatusChip, StickerCard } from "@/components/ui";
import { CONTRACT_ADDRESS, CONTRACT_CONFIGURED, NETWORK } from "@/lib/genlayer";
import { shortAddr } from "@/lib/format";

/**
 * The manual. Everything a second engineer (or a judge, or future you) needs
 * to understand HypeBond without reading all 864 lines of the contract.
 *
 * Numbers, statuses and platform rules are imported from `@hypebond/shared`
 * rather than retyped, so this page cannot drift away from the code the way
 * a markdown file would — shared is itself drift-guarded against the
 * contract by the Python suite.
 */

// ---------------------------------------------------------------- nav

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "architecture", label: "Architecture" },
  { id: "lifecycle", label: "Deal lifecycle" },
  { id: "verification", label: "Verification" },
  { id: "contract-api", label: "Contract API" },
  { id: "security", label: "Security model" },
  { id: "frontend", label: "Frontend" },
  { id: "setup", label: "Setup" },
  { id: "testing", label: "Testing" },
  { id: "reference", label: "Reference" },
] as const;

const SECTION_IDS = SECTIONS.map((s) => s.id);

/** Highlight the heading nearest the top of the viewport. */
function useActiveSection(): string {
  const [active, setActive] = useState<string>(SECTION_IDS[0]);
  useEffect(() => {
    const seen = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting);
        const first = SECTION_IDS.find((id) => seen.get(id));
        if (first) setActive(first);
      },
      // Top band only: a section counts as "current" once its heading
      // crosses the top of the viewport, not when its tail is still visible.
      { rootMargin: "-88px 0px -65% 0px" }
    );
    for (const id of SECTION_IDS) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);
  return active;
}

function TableOfContents() {
  const active = useActiveSection();
  return (
    <nav aria-label="On this page" className="sticky top-8">
      <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-bone/30">
        on this page
      </p>
      <ul className="space-y-0.5 border-l-2 border-static">
        {SECTIONS.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              aria-current={active === s.id ? "true" : undefined}
              className={`-ml-0.5 block border-l-2 py-1.5 pl-3 font-mono text-xs transition-colors ${
                active === s.id
                  ? "border-hype text-hype"
                  : "border-transparent text-bone/45 hover:text-bone"
              }`}
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// ---------------------------------------------------------------- primitives

function Section({
  id,
  title,
  lede,
  children,
}: {
  id: string;
  title: string;
  lede?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <SectionTitle>{title}</SectionTitle>
      {lede && (
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-bone/60">
          {lede}
        </p>
      )}
      <div className="mt-6 space-y-6">{children}</div>
    </section>
  );
}

function H3({ children }: { children: ReactNode }) {
  return (
    <h3 className="font-display text-lg font-bold uppercase tracking-tight text-bone">
      {children}
    </h3>
  );
}

function P({ children }: { children: ReactNode }) {
  return (
    <p className="max-w-2xl text-sm leading-relaxed text-bone/60">{children}</p>
  );
}

/** Inline code — mono, tinted, never wraps mid-token. */
function C({ children }: { children: ReactNode }) {
  return (
    <code className="whitespace-nowrap rounded bg-static/60 px-1.5 py-0.5 font-mono text-[0.8em] text-bone/90">
      {children}
    </code>
  );
}

/**
 * Diagram block. Unlike `MonoBlock` this does NOT wrap — box drawing has to
 * scroll sideways on a phone or it turns into confetti.
 */
function Diagram({ children, label }: { children: string; label?: string }) {
  return (
    <figure className="rounded-card border-2 border-static bg-static/25">
      <pre
        className="overflow-x-auto whitespace-pre p-4 font-mono text-[11px] leading-relaxed text-bone/80 md:text-xs"
        aria-label={label}
      >
        {children}
      </pre>
    </figure>
  );
}

function Shell({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto whitespace-pre rounded-card border-2 border-static bg-static/25 p-4 font-mono text-xs leading-relaxed text-bone/85">
      {children}
    </pre>
  );
}

const NOTE_TONES = {
  info: "border-pulse bg-pulse/10 text-pulse",
  warn: "border-heat bg-heat/10 text-heat",
  good: "border-volt bg-volt/10 text-volt",
} as const;

function Note({
  tone = "info",
  title,
  children,
}: {
  tone?: keyof typeof NOTE_TONES;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className={`rounded-card border-2 p-4 ${NOTE_TONES[tone]}`}>
      <p className="font-display text-xs font-bold uppercase tracking-widest">
        {title}
      </p>
      <div className="mt-1.5 text-sm leading-relaxed text-bone/70">
        {children}
      </div>
    </div>
  );
}

/** Horizontally scrollable table — the page body must never scroll. */
function Table({
  head,
  rows,
}: {
  head: string[];
  rows: ReactNode[][];
}) {
  return (
    <div className="overflow-x-auto rounded-card border-2 border-static">
      <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b-2 border-static bg-static/40">
            {head.map((h) => (
              <th
                key={h}
                scope="col"
                className="px-4 py-2.5 font-display text-[11px] font-bold uppercase tracking-widest text-bone/50"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-static/60 last:border-0">
              {r.map((cell, j) => (
                <td
                  key={j}
                  className="px-4 py-3 align-top text-bone/70 [&>code]:whitespace-nowrap"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** One contract method: signature, who may call it, and what it does. */
function Method({
  sig,
  caller,
  from,
  children,
}: {
  sig: string;
  caller: string;
  from: string;
  children: ReactNode;
}) {
  return (
    <StickerCard className="p-5">
      <code className="block overflow-x-auto whitespace-pre font-mono text-sm text-hype">
        {sig}
      </code>
      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 font-mono text-[11px]">
        <div className="flex gap-2">
          <dt className="uppercase tracking-widest text-bone/30">caller</dt>
          <dd className="text-bone/70">{caller}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="uppercase tracking-widest text-bone/30">from</dt>
          <dd className="text-bone/70">{from}</dd>
        </div>
      </dl>
      <div className="mt-3 space-y-2 text-sm leading-relaxed text-bone/60">
        {children}
      </div>
    </StickerCard>
  );
}

// ---------------------------------------------------------------- content data

const STATUS_ROWS: Record<
  DealStatus,
  { meaning: string; next: string; money: string }
> = {
  FUNDED: {
    meaning: "Escrow locked. Waiting for the influencer to post.",
    meaningShort: "",
    next: "submit_post · cancel_deal · claim_timeout",
    money: "held",
  } as never,
  SUBMITTED: {
    meaning:
      "URL is in, but the initial check never produced a usable verdict. Retryable.",
    next: "recheck_post · claim_timeout",
    money: "held",
  } as never,
  GRACE_PERIOD: {
    meaning: `Initial check failed. The influencer has ${GRACE_HOURS}h to fix or repost.`,
    next: "submit_post · claim_timeout",
    money: "held",
  } as never,
  VERIFYING: {
    meaning:
      "Initial check passed. Waiting out the agreed live window before final verification.",
    next: "finalize · claim_timeout",
    money: "held",
  } as never,
  PAID: {
    meaning: "Final verification passed.",
    next: "— terminal",
    money: "→ influencer",
  } as never,
  VERIFIED_FAIL: {
    meaning: "Final verification failed.",
    next: "— terminal",
    money: "→ brand",
  } as never,
  REFUNDED: {
    meaning: "Brand reclaimed the escrow after a window lapsed.",
    next: "— terminal",
    money: "→ brand",
  } as never,
  CANCELLED: {
    meaning: "Brand cancelled before any post was submitted.",
    next: "— terminal",
    money: "→ brand",
  } as never,
};

const ARCHITECTURE = `┌ apps/web ─ Vite · React 18 · TypeScript ────────────────────
│  pages/       Landing · NewDeal · DealPage · Dashboard · Docs
│  components/  Shell · Timeline · ChecksList · ui · motion/
│  hooks/       useHypebond — TanStack Query, polls while live
│  lib/         contract.ts · genlayer.ts · wallet · toast
└──┬──────────────────────────────────────────────────────────
   │  imports types, URL rules, terms builder, window lengths
┌──▼ packages/shared ─ the single source of shape ────────────
│  Deal · DealStatus · parseDeal · parseVerdict
│  isValidPostUrl · termsProblem · buildTerms · deadlines
└──┬──────────────────────────────────────────────────────────
   │  mirrors the contract — a drift guard fails the suite
   │  if fields, statuses or platform domains stop matching
┌──▼ packages/contracts/hypebond.py ─ GenVM ──────────────────
│  storage: TreeMap<u256, Deal> + per-user index arrays
│  escrow · web render · LLM judge · equivalence principle
└──┬──────────────────────────────────────────────────────────
   │  gl.nondet.web.render(url)      ← the live post
   │  gl.nondet.exec_prompt(prompt)  ← the judge
   ▼
   the actual internet — x.com · instagram · youtube · tiktok`;

const LIFECYCLE = `                     create_deal (payable)
                              │
                              ▼
                          ┌────────┐  cancel_deal ──────► CANCELLED
                          │ FUNDED │  ${SUBMIT_WINDOW_DAYS}d no post ─────► REFUNDED
                          └────┬───┘
                    submit_post│ (influencer only)
                               ▼
                        ╔══════════════╗
                        ║ initial check║  fetch + judge + consensus
                        ╚══╦════╦═══╦══╝
              verdict: pass ║    ║   ║ unusable output (fail closed)
                            ║    ║   ╚═══════► SUBMITTED
                            ║    ║              │ recheck_post (anyone)
                            ║    ║              └─► back to the check
                            ║    ║ verdict: fail
                            ║    ▼
                            ║  GRACE_PERIOD ──${GRACE_HOURS}h──► REFUNDED
                            ║    │ submit_post (fix / repost)
                            ║    └─► back to the check
                            ▼
                        VERIFYING
                            │ live window ends → finalize (anyone)
                            ▼
                        ╔══════════════╗
                        ║ final check  ║  re-fetch: is it STILL live?
                        ╚══╦════════╦══╝
                   pass    ║        ║    fail
                           ▼        ▼
                         PAID   VERIFIED_FAIL
                    (→influencer)  (→brand)`;

const VERIFICATION = `submit_post / recheck_post / finalize
        │
        ▼
  _run_check ── stamps last_check_at (${RECHECK_COOLDOWN_SECONDS}s cooldown)
        │
        ▼
  gl.eq_principle.prompt_comparative(do_judge, principle)
        │            each validator runs do_judge independently
        │
        ├─ 1. gl.nondet.web.render(post_url, mode="text")
        │       └─ unreachable / empty → deterministic FAIL verdict,
        │          no model call at all
        ├─ 2. page[:6000]
        ├─ 3. _scrub_invisible   strip zero-width + bidi code points
        ├─ 4. _redact_delimiter_runs   "<<<" ">>>" "---" → [redacted]
        ├─ 5. page[:6000] again (redaction can grow the text)
        ├─ 6. build the judging prompt
        │       terms  in --- BEGIN/END DEAL TERMS --- (marker-free)
        │       page   in <<<PAGE>>> / <<<END PAGE>>>  (untrusted)
        ├─ 7. gl.nondet.exec_prompt(prompt) → strict JSON
        └─ 8. parse · _verdict_bool · clamp to 12 checks
                 pass = exists AND overall AND checks AND all(passed)
        │
        ▼
  consensus compares VERDICT BOOLEANS ONLY — wording may differ
        │
        ├─ agreed  → re-parse, re-clamp, RE-DERIVE pass, settle
        └─ error / no agreement → VerificationErrored, status unchanged`;
