import { motion, useReducedMotion } from "framer-motion";
import { PLATFORM_LABELS, type Platform } from "@hypebond/shared";

function PlatformIcon({ platform, size = 28 }: { platform: Platform; size?: number }) {
  const common = { width: size, height: size, fill: "currentColor" } as const;
  switch (platform) {
    case "x":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M18.9 2H22l-6.77 7.74L23.2 22h-6.23l-4.88-6.38L6.5 22H3.34l7.24-8.28L2.4 2h6.39l4.41 5.83L18.9 2zm-1.1 18.13h1.72L7.86 3.77H6.02l11.78 16.36z" />
        </svg>
      );
    case "instagram":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M12 2.2c3.2 0 3.58.01 4.85.07 3.25.15 4.73 1.66 4.88 4.88.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.15 3.22-1.62 4.73-4.88 4.88-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-3.26-.15-4.73-1.67-4.88-4.88C2.21 15.58 2.2 15.2 2.2 12s.01-3.58.07-4.85C2.42 3.93 3.9 2.42 7.15 2.27 8.42 2.21 8.8 2.2 12 2.2zm0 1.8c-3.15 0-3.5.01-4.74.07-2.42.11-3.55 1.26-3.66 3.66-.06 1.24-.07 1.6-.07 4.74s.01 3.5.07 4.74c.11 2.4 1.24 3.55 3.66 3.66 1.24.06 1.59.07 4.74.07s3.5-.01 4.74-.07c2.41-.11 3.55-1.26 3.66-3.66.06-1.24.07-1.6.07-4.74s-.01-3.5-.07-4.74c-.11-2.4-1.25-3.55-3.66-3.66-1.24-.06-1.59-.07-4.74-.07zm0 3.06a4.94 4.94 0 110 9.88 4.94 4.94 0 010-9.88zm0 1.8a3.14 3.14 0 100 6.28 3.14 3.14 0 000-6.28zm5.14-3.2a1.15 1.15 0 110 2.31 1.15 1.15 0 010-2.31z" />
        </svg>
      );
    case "youtube":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M23.5 6.19a3.02 3.02 0 00-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.5A3.02 3.02 0 00.5 6.19C0 8.07 0 12 0 12s0 3.93.5 5.81a3.02 3.02 0 002.12 2.14c1.88.5 9.38.5 9.38.5s7.5 0 9.38-.5a3.02 3.02 0 002.12-2.14C24 15.93 24 12 24 12s0-3.93-.5-5.81zM9.55 15.57V8.43L15.82 12l-6.27 3.57z" />
        </svg>
      );
    case "tiktok":
      return (
        <svg viewBox="0 0 24 24" {...common}>
          <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64c.3 0 .58.05.85.13V9.4a6.33 6.33 0 00-.85-.06 6.34 6.34 0 106.34 6.34V8.66a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.09z" />
        </svg>
      );
  }
}

/** Big tappable platform tiles for the create flow. */
export function PlatformTile({
  platform,
  selected,
  onSelect,
}: {
  platform: Platform;
  selected: boolean;
  onSelect: (p: Platform) => void;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.button
      type="button"
      onClick={() => onSelect(platform)}
      whileTap={reduced ? undefined : { scale: 0.96 }}
      transition={{ type: "spring", stiffness: 500, damping: 24 }}
      aria-pressed={selected}
      className={`flex flex-col items-center gap-3 rounded-card border-2 px-4 py-6 transition-colors ${
        selected
          ? "border-hype bg-hype/10 text-hype shadow-sticker"
          : "border-static text-bone/70 hover:border-pulse hover:text-bone"
      }`}
    >
      <PlatformIcon platform={platform} />
      <span className="font-display text-sm font-bold uppercase tracking-wide">
        {PLATFORM_LABELS[platform]}
      </span>
    </motion.button>
  );
}

export { PlatformIcon };
