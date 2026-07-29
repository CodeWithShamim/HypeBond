import { motion, useReducedMotion } from "framer-motion";
import type { Deal } from "@hypebond/shared";
import { formatDate } from "@/lib/format";

interface Node {
  label: string;
  detail: string;
  state: "done" | "current" | "todo" | "fail";
}

/** Derive the six timeline nodes from the deal's status + timestamps. */
export function timelineNodes(deal: Deal): Node[] {
  const s = deal.status;
  const submitted = deal.submitted_at > 0;
  const settledPass = s === "PAID";
  const settledFail = s === "VERIFIED_FAIL";
  const dead = s === "REFUNDED" || s === "CANCELLED";

  const nodes: Node[] = [
    {
      label: "Funded",
      detail: formatDate(deal.created_at),
      state: "done",
    },
    {
      label: "Post submitted",
      detail: submitted ? formatDate(deal.submitted_at) : "waiting on influencer",
      state: submitted ? "done" : dead ? "fail" : "current",
    },
    {
      label: "Initial check",
      detail:
        s === "GRACE_PERIOD"
          ? "failed — grace period open"
          : s === "SUBMITTED"
            ? "validators reading the post"
            : submitted && !dead
              ? "passed"
              : "—",
      state:
        s === "GRACE_PERIOD"
          ? "fail"
          : s === "SUBMITTED"
            ? "current"
            : ["VERIFYING", "PAID", "VERIFIED_FAIL"].includes(s)
              ? "done"
              : dead
                ? "fail"
                : "todo",
    },
    {
      label: "Live window",
      detail:
        deal.verify_after > 0 && ["VERIFYING", "PAID", "VERIFIED_FAIL"].includes(s)
          ? `until ${formatDate(deal.verify_after)}`
          : `${deal.min_live_days} day${deal.min_live_days === 1 ? "" : "s"} minimum`,
      state:
        s === "VERIFYING"
          ? "current"
          : settledPass || settledFail
            ? "done"
            : "todo",
    },
    {
      label: "Final verification",
      detail: settledPass
        ? "passed"
        : settledFail
          ? "failed"
          : "anyone can trigger after the window",
      state: settledPass ? "done" : settledFail ? "fail" : "todo",
    },
    {
      label: settledFail || dead ? "Refunded" : "Paid",
      detail: settledPass
        ? "escrow released to influencer"
        : settledFail
          ? "escrow returned to brand"
          : dead
            ? s === "CANCELLED"
              ? "cancelled by brand"
              : "reclaimed by brand"
            : "—",
      state: settledPass ? "done" : settledFail || dead ? "fail" : "todo",
    },
  ];
  return nodes;
}

const DOT: Record<Node["state"], string> = {
  done: "border-hype bg-hype",
  current: "border-hype bg-void",
  todo: "border-static bg-void",
  fail: "border-heat bg-heat",
};

/** Connected status timeline; reached nodes light up in hype. */
export function Timeline({ deal }: { deal: Deal }) {
  const reduced = useReducedMotion();
  const nodes = timelineNodes(deal);
  return (
    <ol className="relative space-y-0">
      {nodes.map((n, i) => {
        const last = i === nodes.length - 1;
        return (
          <li key={n.label} className="relative flex gap-4 pb-6 last:pb-0">
            {!last && (
              <span
                className={`absolute left-[7px] top-5 h-full w-0.5 ${
                  n.state === "done" ? "bg-hype/60" : "bg-static"
                }`}
                aria-hidden
              />
            )}
            <span className="relative z-10 mt-1 flex h-4 w-4 shrink-0">
              <motion.span
                initial={reduced ? false : { scale: 0 }}
                animate={{ scale: 1 }}
                transition={{
                  delay: reduced ? 0 : i * 0.07,
                  type: "spring",
                  stiffness: 400,
                  damping: 20,
                }}
                className={`h-4 w-4 rounded-full border-2 ${DOT[n.state]}`}
              />
              {n.state === "current" && !reduced && (
                <span className="absolute inset-0 animate-ping rounded-full bg-hype/40" />
              )}
            </span>
            <div className="min-w-0">
              <p
                className={`font-display text-sm font-bold uppercase tracking-wide ${
                  n.state === "todo"
                    ? "text-bone/35"
                    : n.state === "fail"
                      ? "text-heat"
                      : "text-bone"
                }`}
              >
                {n.label}
              </p>
              <p className="mt-0.5 font-mono text-xs text-bone/45">{n.detail}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
