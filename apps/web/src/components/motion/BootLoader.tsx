import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Marquee } from "./Marquee";

const WORD = "HYPEBOND";
const STRIP = "BOND THE HYPE ✦ VERIFY THE POST ✦ RELEASE THE BAG ✦ ";

/**
 * Full-screen boot loader. The percentage is tied to REAL readiness
 * (fonts + first paint), eased with a rAF chase so it feels alive — never
 * a fake timer. Exits by splitting into two panels that slide apart.
 */
export function BootLoader({ onComplete }: { onComplete: () => void }) {
  const reduced = useReducedMotion();
  const [pct, setPct] = useState(0);
  const [exiting, setExiting] = useState(false);
  const readyRef = useRef(false);
  const doneRef = useRef(false);

  // Real readiness: fonts loaded + two paint frames.
  useEffect(() => {
    let alive = true;
    const paint = new Promise<void>((res) =>
      requestAnimationFrame(() => requestAnimationFrame(() => res()))
    );
    const fonts =
      "fonts" in document
        ? document.fonts.ready.then(() => undefined)
        : Promise.resolve(undefined);
    Promise.all([fonts, paint, new Promise((r) => setTimeout(r, 350))]).then(
      () => {
        if (alive) readyRef.current = true;
      }
    );
    return () => {
      alive = false;
    };
  }, []);

  // Eased counter chasing the readiness target.
  useEffect(() => {
    if (reduced) {
      // Reduced motion: wait for readiness, then done — no theatrics.
      const t = setInterval(() => {
        if (readyRef.current && !doneRef.current) {
          doneRef.current = true;
          clearInterval(t);
          onComplete();
        }
      }, 80);
      return () => clearInterval(t);
    }
    let raf = 0;
    let value = 0;
    const tick = () => {
      const target = readyRef.current ? 100 : 88;
      value += (target - value) * 0.06;
      if (readyRef.current && value > 99.4) value = 100;
      setPct(Math.round(value));
      if (value >= 100 && !doneRef.current) {
        doneRef.current = true;
        setTimeout(() => setExiting(true), 220);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced, onComplete]);

  if (reduced) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-void">
        <span className="font-display text-3xl font-bold text-bond">
          HYPEBOND
        </span>
      </div>
    );
  }

  const panel = "absolute inset-x-0 h-1/2 bg-void";

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden">
      {/* two split panels that slide apart on exit */}
      <motion.div
        className={`${panel} top-0`}
        animate={exiting ? { y: "-100%" } : { y: 0 }}
        transition={{ duration: 0.55, ease: [0.76, 0, 0.24, 1] }}
        onAnimationComplete={() => {
          if (exiting) onComplete();
        }}
      >
        <Marquee className="border-b border-static/60 py-1.5">
          <span className="font-display text-xs font-bold uppercase tracking-[0.3em] text-bone/40">
            {STRIP.repeat(4)}
          </span>
        </Marquee>
      </motion.div>
      <motion.div
        className={`${panel} bottom-0`}
        animate={exiting ? { y: "100%" } : { y: 0 }}
        transition={{ duration: 0.55, ease: [0.76, 0, 0.24, 1] }}
      >
        <div className="absolute bottom-0 inset-x-0">
          <Marquee reverse className="border-t border-static/60 py-1.5">
            <span className="font-display text-xs font-bold uppercase tracking-[0.3em] text-bone/40">
              {STRIP.repeat(4)}
            </span>
          </Marquee>
        </div>
      </motion.div>

      {/* center content, fades before the split */}
      <motion.div
        className="absolute inset-0 flex flex-col items-center justify-center gap-6"
        animate={{ opacity: exiting ? 0 : 1 }}
        transition={{ duration: 0.2 }}
      >
        <div className="flex overflow-hidden">
          {WORD.split("").map((ch, i) => (
            <motion.span
              key={i}
              initial={{ y: "110%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{
                delay: 0.12 + i * 0.07,
                type: "spring",
                stiffness: 320,
                damping: 26,
              }}
              className="text-bond font-display text-5xl font-bold tracking-tight md:text-7xl"
            >
              {ch}
            </motion.span>
          ))}
        </div>
        <span className="font-mono text-6xl font-bold tabular-nums text-bone md:text-8xl">
          {String(pct).padStart(3, "0")}
          <span className="text-bone/40">%</span>
        </span>
        <span className="font-mono text-xs uppercase tracking-[0.35em] text-bone/40">
          locking the drop
        </span>
      </motion.div>
    </div>
  );
}
