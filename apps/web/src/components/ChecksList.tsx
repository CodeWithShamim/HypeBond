import { motion, useReducedMotion } from "framer-motion";
import { parseVerdict } from "@hypebond/shared";

/** Renders the on-chain checks_passed JSON as a pass/fail checklist with
 * the AI's evidence quotes. */
export function ChecksList({ checksJson }: { checksJson: string }) {
  const reduced = useReducedMotion();
  const verdict = parseVerdict(checksJson);
  if (!verdict) return null;

  const rows = [
    {
      requirement: "Post is live and publicly readable",
      passed: verdict.exists,
      evidence: "",
    },
    ...verdict.checks,
  ];

  return (
    <ul className="space-y-2">
      {rows.map((c, i) => (
        <motion.li
          key={i}
          initial={reduced ? false : { opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: reduced ? 0 : i * 0.06 }}
          className="flex items-start gap-3 rounded-card border-2 border-static px-4 py-3"
        >
          <span
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold ${
              c.passed ? "bg-volt text-void" : "bg-heat text-void"
            }`}
            aria-label={c.passed ? "passed" : "failed"}
          >
            {c.passed ? "✓" : "✕"}
          </span>
          <span className="min-w-0">
            <span className="block text-sm text-bone">{c.requirement}</span>
            {c.evidence && (
              <span className="mt-0.5 block font-mono text-xs text-bone/45">
                “{c.evidence}”
              </span>
            )}
          </span>
        </motion.li>
      ))}
    </ul>
  );
}
