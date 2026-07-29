import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

/**
 * Rolling odometer number: each character column springs vertically when
 * its value changes. Animates transform/opacity only.
 */
export function Odometer({
  value,
  className = "",
}: {
  value: string;
  className?: string;
}) {
  const reduced = useReducedMotion();
  if (reduced) {
    return (
      <span className={`font-mono tabular-nums ${className}`}>{value}</span>
    );
  }
  const chars = value.split("");
  return (
    <span
      className={`inline-flex overflow-hidden font-mono tabular-nums ${className}`}
      aria-label={value}
    >
      {chars.map((ch, i) => (
        <span key={i} className="relative inline-block">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={`${i}-${ch}`}
              initial={{ y: "0.9em", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "-0.9em", opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 34 }}
              className="inline-block"
            >
              {ch === " " ? " " : ch}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  );
}
