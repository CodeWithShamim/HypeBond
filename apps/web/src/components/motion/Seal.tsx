import { motion, useReducedMotion } from "framer-motion";
import { useMemo, useState } from "react";

export type SealVerdict = "pass" | "fail";

const PALETTE = ["#FF3D8A", "#7A5CFF", "#D4FF3D", "#FF7A3D", "#F4F2FF"];

interface Particle {
  x: number;
  y: number;
  rotate: number;
  color: string;
  size: number;
  delay: number;
}

function makeParticles(count: number): Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.6;
    const dist = 70 + Math.random() * 70;
    out.push({
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      rotate: Math.random() * 360 - 180,
      color: PALETTE[i % PALETTE.length],
      size: 6 + Math.random() * 6,
      delay: Math.random() * 0.08,
    });
  }
  return out;
}

/**
 * The BOND SEAL — holographic circular sticker that slams onto a card when
 * a deal is verified. PASS = volt ring "VERIFIED LIVE", FAIL = heat ring
 * "BOND BROKEN". Slam: 1.6 → 1 spring + rotation + one-frame white flash +
 * confetti burst. Reduced motion: instant, no confetti.
 */
export function Seal({
  verdict,
  size = 160,
  slam = true,
  className = "",
}: {
  verdict: SealVerdict;
  size?: number;
  slam?: boolean;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const [hover, setHover] = useState(false);
  const particles = useMemo(() => makeParticles(11), []);
  const pass = verdict === "pass";
  const ring = pass ? "#D4FF3D" : "#FF7A3D";
  const label = pass ? "VERIFIED LIVE ✦ " : "BOND BROKEN ✦ ";
  const animate = slam && !reduced;

  const r = size / 2;
  const textR = r - size * 0.14;
  const pathId = useMemo(() => `sealpath-${Math.random().toString(36).slice(2)}`, []);

  return (
    <div
      className={`relative inline-block ${className}`}
      style={{ width: size, height: size }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* confetti burst */}
      {animate &&
        particles.map((p, i) => (
          <motion.span
            key={i}
            className="pointer-events-none absolute left-1/2 top-1/2"
            style={{
              width: p.size,
              height: p.size,
              background: p.color,
              borderRadius: 2,
            }}
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 1 }}
            animate={{
              x: p.x,
              y: p.y,
              opacity: 0,
              rotate: p.rotate,
              scale: 0.6,
            }}
            transition={{ duration: 0.9, delay: 0.18 + p.delay, ease: "easeOut" }}
          />
        ))}

      <motion.div
        className="relative h-full w-full"
        initial={animate ? { scale: 1.6, rotate: -14, opacity: 0 } : false}
        animate={{ scale: 1, rotate: -6, opacity: 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 22, mass: 0.9 }}
      >
        {/* holographic sheen — conic gradient that shifts on hover */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `conic-gradient(from ${hover ? 140 : 0}deg, #FF3D8A, #7A5CFF, #D4FF3D, #FF3D8A)`,
            transition: "background 0.6s ease",
            filter: "saturate(1.2)",
          }}
        />
        <div
          className="absolute rounded-full bg-void"
          style={{ inset: size * 0.045 }}
        />

        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="absolute inset-0 h-full w-full"
          role="img"
          aria-label={pass ? "Verified live" : "Bond broken"}
        >
          <defs>
            <path
              id={pathId}
              d={`M ${r},${r} m -${textR},0 a ${textR},${textR} 0 1,1 ${textR * 2},0 a ${textR},${textR} 0 1,1 -${textR * 2},0`}
            />
          </defs>
          <circle
            cx={r}
            cy={r}
            r={r - size * 0.09}
            fill="none"
            stroke={ring}
            strokeWidth={size * 0.018}
            strokeDasharray={`${size * 0.05} ${size * 0.028}`}
          />
          <text
            fill={ring}
            fontSize={size * 0.085}
            fontWeight={700}
            letterSpacing={size * 0.012}
            style={{ fontFamily: '"Space Grotesk", sans-serif' }}
          >
            <textPath href={`#${pathId}`}>
              {label.repeat(3)}
            </textPath>
          </text>
          {/* center mark */}
          <circle cx={r} cy={r} r={size * 0.19} fill={ring} />
          <text
            x={r}
            y={r + size * 0.065}
            textAnchor="middle"
            fill="#0D0B14"
            fontSize={size * 0.19}
            fontWeight={800}
            style={{ fontFamily: '"Space Grotesk", sans-serif' }}
          >
            {pass ? "✓" : "✕"}
          </text>
        </svg>

        {/* one-frame white flash on slam */}
        {animate && (
          <motion.div
            className="pointer-events-none absolute inset-0 rounded-full bg-bone"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 0.22, times: [0, 0.5, 1], delay: 0.14 }}
          />
        )}
      </motion.div>
    </div>
  );
}
