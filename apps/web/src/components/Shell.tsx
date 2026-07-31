import { type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CONTRACT_CONFIGURED, NETWORK } from "@/lib/genlayer";
import { ExplorerLink } from "./ExplorerLink";
import { WalletButton } from "./WalletButton";

const NAV = [
  { to: "/", label: "Home", icon: "◆", end: true },
  { to: "/new", label: "New bond", icon: "＋", end: false },
  { to: "/dashboard", label: "Dashboard", icon: "▦", end: false },
  { to: "/docs", label: "Docs", icon: "▤", end: false },
];

function Wordmark() {
  return (
    <NavLink to="/" className="font-display text-xl font-bold tracking-tight">
      <span className="text-bond">HYPE</span>
      <span className="text-bone">BOND</span>
    </NavLink>
  );
}

/**
 * App chrome: persistent left rail (desktop) collapsing to a bottom tab
 * bar (mobile). Content lives in a strict 12-col grid container.
 */
export function Shell({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <div className="min-h-screen md:pl-56">
      {/* left rail (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-56 flex-col border-r-2 border-static bg-void p-5 md:flex">
        <Wordmark />
        <nav className="mt-10 flex flex-col gap-1">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-card px-3 py-2.5 font-display text-sm font-bold uppercase tracking-wide transition-colors ${
                  isActive
                    ? "bg-static/60 text-hype"
                    : "text-bone/60 hover:bg-static/30 hover:text-bone"
                }`
              }
            >
              <span aria-hidden>{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-bone/30">
            network: {NETWORK}
          </p>
          <ExplorerLink />
          <WalletButton />
        </div>
      </aside>

      {/* top bar (mobile) */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b-2 border-static bg-void/95 px-4 py-3 backdrop-blur md:hidden">
        <Wordmark />
        <div className="flex items-center gap-2">
          <ExplorerLink compact />
          <WalletButton compact />
        </div>
      </header>

      {/* contract-not-configured banner */}
      <AnimatePresence>
        {!CONTRACT_CONFIGURED && (
          <motion.div
            initial={reduced ? false : { y: -8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="border-b-2 border-heat bg-heat/10 px-4 py-2 text-center font-mono text-xs text-heat"
          >
            VITE_HYPEBOND_ADDRESS is not set — deploy the contract and add it
            to the repo-root .env, then restart the dev server.
          </motion.div>
        )}
      </AnimatePresence>

      {/* 12-col content grid */}
      <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 md:px-8 md:pb-16">
        {children}
      </main>

      {/* bottom tab bar (mobile) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t-2 border-static bg-void md:hidden">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2.5 font-display text-[10px] font-bold uppercase tracking-wide ${
                isActive ? "text-hype" : "text-bone/50"
              }`
            }
          >
            <span className="text-base" aria-hidden>
              {n.icon}
            </span>
            {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
