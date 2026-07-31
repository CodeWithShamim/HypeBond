import { useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CONTRACT_CONFIGURED, NETWORK } from "@/lib/genlayer";
import { useWallet } from "@/lib/wallet";
import { errorMessage, shortAddr } from "@/lib/format";
import { useToast } from "@/lib/toast";
import { ExplorerLink } from "./ExplorerLink";
import { Button } from "./ui";

const NAV = [
  { to: "/", label: "Home", icon: "◆", end: true },
  { to: "/new", label: "New bond", icon: "＋", end: false },
  { to: "/dashboard", label: "Dashboard", icon: "▦", end: false },
];

function Wordmark() {
  return (
    <NavLink to="/" className="font-display text-xl font-bold tracking-tight">
      <span className="text-bond">HYPE</span>
      <span className="text-bone">BOND</span>
    </NavLink>
  );
}

function WalletChip({ compact = false }: { compact?: boolean }) {
  const wallet = useWallet();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const connect = async (kind: "metamask" | "burner") => {
    setBusy(true);
    try {
      if (kind === "metamask") await wallet.connectMetaMask();
      else wallet.connectBurner();
      setOpen(false);
    } catch (err) {
      toast.push("error", "Connect failed", errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (wallet.address) {
    return (
      <button
        type="button"
        onClick={wallet.disconnect}
        title="Disconnect"
        className={`group flex items-center gap-2 rounded-card border-2 border-static px-3 py-2 font-mono text-xs text-bone/80 transition-colors hover:border-heat hover:text-heat ${
          compact ? "" : "w-full"
        }`}
      >
        <span className="h-2 w-2 rounded-full bg-volt" />
        <span className="truncate">{shortAddr(wallet.address)}</span>
        <span className="ml-auto hidden text-bone/30 group-hover:text-heat md:inline">
          ✕
        </span>
      </button>
    );
  }

  return (
    <div className={compact ? "" : "w-full"}>
      {open ? (
        <div className="flex flex-col gap-2">
          <Button
            variant="ghost"
            loading={busy && wallet.connecting}
            className="!px-3 !py-2 text-xs"
            onClick={() => connect("metamask")}
            disabled={!wallet.metaMaskAvailable || busy}
          >
            MetaMask
          </Button>
          {wallet.burnerAvailable && (
            <Button
              variant="ghost"
              className="!px-3 !py-2 text-xs"
              onClick={() => connect("burner")}
              disabled={busy}
            >
              Guest wallet
            </Button>
          )}
          {!wallet.metaMaskAvailable && (
            <p className="font-mono text-[10px] text-bone/40">
              MetaMask not detected —{" "}
              <a
                href="https://metamask.io"
                target="_blank"
                rel="noreferrer"
                className="text-pulse underline"
              >
                install it
              </a>
            </p>
          )}
        </div>
      ) : (
        <Button
          className={compact ? "!px-3 !py-2 text-xs" : "w-full !py-2 text-xs"}
          onClick={() => setOpen(true)}
        >
          Connect
        </Button>
      )}
    </div>
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
          <WalletChip />
        </div>
      </aside>

      {/* top bar (mobile) */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b-2 border-static bg-void/95 px-4 py-3 backdrop-blur md:hidden">
        <Wordmark />
        <div className="flex items-center gap-2">
          <ExplorerLink compact />
          <WalletChip compact />
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
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t-2 border-static bg-void md:hidden">
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
