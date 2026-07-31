import {
  motion,
  useIsPresent,
  useReducedMotion,
  type Variants,
} from "framer-motion";
import type { ReactNode } from "react";

/** Card-level stagger item — use inside <PageFrame> for cards/sections. */
export const pageItem: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 300, damping: 30 },
  },
};

export function PageItem({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div variants={pageItem} className={className}>
      {children}
    </motion.div>
  );
}

/**
 * Route transition frame. Wrap every page's content in this, inside the
 * AnimatePresence keyed by pathname (see App.tsx).
 *
 * Exit: page scales to 0.98 + fades. Enter: a hype→pulse gradient wipe
 * sweeps left→right off-screen while content slides up 24px, staggering
 * children. Total under 650ms.
 */
export function PageFrame({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  // The presence is a plain (sync) one, so the outgoing and incoming pages
  // overlap for the length of the exit. Taking the outgoing one out of flow
  // keeps the incoming page at the top of <main> instead of pushed below it.
  const isPresent = useIsPresent();

  if (reduced) {
    return <div>{children}</div>;
  }

  return (
    <motion.div
      initial="hidden"
      animate="show"
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.18 } }}
      style={
        isPresent
          ? undefined
          : { position: "absolute", top: 0, left: 0, right: 0 }
      }
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.06, delayChildren: 0.12 } },
      }}
    >
      {/* gradient wipe sweeping across on entry */}
      <motion.div
        className="bg-bond pointer-events-none fixed inset-0 z-[80]"
        initial={{ x: "-100%" }}
        animate={{ x: "100%" }}
        transition={{ duration: 0.42, ease: [0.76, 0, 0.24, 1] }}
      />
      <motion.div variants={pageItem}>{children}</motion.div>
    </motion.div>
  );
}
