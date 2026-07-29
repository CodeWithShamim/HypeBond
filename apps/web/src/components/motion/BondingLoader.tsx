import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

const DEFAULT_LINES = [
  "locking the bag…",
  "validators reading the post…",
  "counting the hype…",
  "checking the receipts…",
];

/**
 * Inline chain-wait loader: the bond seal outline draws itself on loop
 * (SVG pathLength) with rotating mono status lines. Shown while a wallet
 * call or validator verification is pending.
 */
export function BondingLoader({
  lines = DEFAULT_LINES,
  size = 64,
  className = "",
}: {
  lines?: string[];
  size?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % lines.length), 2200);
    return () => clearInterval(t);
  }, [lines.length]);

  const r = size / 2 - 4;

  return (
    <div
      className={`flex items-center gap-4 ${className}`}
      role="status"
      aria-live="polite"
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#2A2540"
          strokeWidth={3}
        />
        {reduced ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="url(#bondgrad)"
            strokeWidth={3}
          />
        ) : (
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="url(#bondgrad)"
            strokeWidth={3}
            strokeLinecap="round"
            initial={{ pathLength: 0, rotate: 0 }}
            animate={{ pathLength: [0, 1, 0], rotate: 360 }}
            transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
            style={{ originX: "50%", originY: "50%" }}
          />
        )}
        <defs>
          <linearGradient id="bondgrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FF3D8A" />
            <stop offset="100%" stopColor="#7A5CFF" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={3.5} fill="#FF3D8A" />
      </svg>
      <div className="h-6 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.p
            key={idx}
            initial={reduced ? false : { y: 14, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { y: -14, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="font-mono text-sm text-bone/70"
          >
            {lines[idx % lines.length]}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
