import { useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Infinite scrolling strip. Content is duplicated once and translated -50%
 * via a CSS keyframe (transform-only, 60fps). Reduced motion renders a
 * single static strip.
 */
export function Marquee({
  children,
  reverse = false,
  className = "",
}: {
  children: ReactNode;
  reverse?: boolean;
  className?: string;
}) {
  const reduced = useReducedMotion();
  if (reduced) {
    return (
      <div className={`overflow-hidden whitespace-nowrap ${className}`}>
        <div className="inline-block">{children}</div>
      </div>
    );
  }
  return (
    <div className={`overflow-hidden whitespace-nowrap ${className}`}>
      <div
        className={`inline-flex w-max ${
          reverse ? "animate-marqueeReverse" : "animate-marquee"
        }`}
      >
        <div className="inline-block">{children}</div>
        <div className="inline-block" aria-hidden>
          {children}
        </div>
      </div>
    </div>
  );
}
