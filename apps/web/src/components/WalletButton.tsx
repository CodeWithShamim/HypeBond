import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { explorerAddressUrl } from "@/lib/genlayer";
import { useWallet } from "@/lib/wallet";
import { errorMessage, shortAddr } from "@/lib/format";
import { useToast } from "@/lib/toast";
import { Button } from "./ui";

/** Close on outside click / Escape — both menus below are popovers. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

function Popover({
  compact,
  children,
}: {
  compact: boolean;
  children: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: compact ? -6 : 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? undefined : { opacity: 0, y: compact ? -6 : 6 }}
      transition={{ duration: 0.14 }}
      // Desktop rail is at the bottom of the viewport, so its menu opens
      // upward; the mobile header menu drops down under the chip.
      className={`z-50 w-64 rounded-card border-2 border-static bg-void p-2 shadow-sticker ${
        compact ? "absolute right-0 top-full mt-2" : "absolute bottom-full left-0 mb-2"
      }`}
      role="menu"
    >
      {children}
    </motion.div>
  );
}

function MenuItem({
  onClick,
  title,
  hint,
  icon,
  disabled = false,
  danger = false,
}: {
  onClick: () => void;
  title: string;
  hint?: string;
  icon: string;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-start gap-3 rounded-card px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        danger ? "hover:bg-heat/10" : "hover:bg-static/50"
      }`}
    >
      <span
        aria-hidden
        className={`mt-0.5 text-sm ${danger ? "text-heat" : "text-hype"}`}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span
          className={`block font-display text-xs font-bold uppercase tracking-wide ${
            danger ? "text-heat" : "text-bone"
          }`}
        >
          {title}
        </span>
        {hint && (
          <span className="block truncate font-mono text-[10px] text-bone/40">
            {hint}
          </span>
        )}
      </span>
    </button>
  );
}

/**
 * The single entry point to a wallet.
 *
 * Privy is the headline option — a creator sent a bond link has an email, not
 * a browser extension, and the embedded wallet is what lets them accept
 * without installing anything. MetaMask stays a first-class direct path for
 * users who already hold GEN, and the guest wallet stays on studionet where
 * there is nothing to lose.
 */
export function WalletButton({ compact = false }: { compact?: boolean }) {
  const wallet = useWallet();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"privy" | "metamask" | null>(null);
  const ref = useDismiss(open, () => setOpen(false));

  const connect = async (which: "privy" | "metamask" | "burner") => {
    if (which === "burner") {
      wallet.connectBurner();
      setOpen(false);
      return;
    }
    setBusy(which);
    try {
      if (which === "privy") await wallet.connectPrivy();
      else await wallet.connectMetaMask();
      setOpen(false);
    } catch (err) {
      toast.push("error", "Connect failed", errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const copyAddress = async () => {
    if (!wallet.address) return;
    try {
      await navigator.clipboard.writeText(wallet.address);
      toast.push("success", "Address copied", wallet.address);
    } catch {
      toast.push("error", "Copy failed", "Clipboard access was denied");
    }
    setOpen(false);
  };

  // ------------------------------------------------------------- connected
  if (wallet.address) {
    const kindLabel =
      wallet.kind === "privy"
        ? wallet.embedded
          ? "Embedded wallet"
          : "Connected wallet"
        : wallet.kind === "metamask"
        ? "MetaMask"
        : "Guest wallet";

    return (
      <div ref={ref} className={compact ? "relative" : "relative w-full"}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          title={wallet.accountLabel ?? wallet.address}
          className={`flex items-center gap-2 rounded-card border-2 border-static px-3 py-2 font-mono text-xs text-bone/80 transition-colors hover:border-hype hover:text-hype ${
            compact ? "" : "w-full"
          }`}
        >
          <span className="h-2 w-2 shrink-0 rounded-full bg-volt" />
          <span className="truncate">{shortAddr(wallet.address)}</span>
          <span className="ml-auto hidden text-bone/30 md:inline" aria-hidden>
            ▾
          </span>
        </button>

        <AnimatePresence>
          {open && (
            <Popover compact={compact}>
              <div className="border-b-2 border-static px-3 pb-2.5 pt-1.5">
                <p className="font-display text-[10px] uppercase tracking-widest text-bone/40">
                  {kindLabel}
                </p>
                {wallet.accountLabel && (
                  <p className="truncate font-body text-xs text-bone">
                    {wallet.accountLabel}
                  </p>
                )}
                <p className="mt-0.5 break-all font-mono text-[10px] text-bone/50">
                  {wallet.address}
                </p>
              </div>
              <div className="pt-1">
                <MenuItem icon="⧉" title="Copy address" onClick={copyAddress} />
                <a
                  role="menuitem"
                  href={explorerAddressUrl(wallet.address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                  className="flex w-full items-center gap-3 rounded-card px-3 py-2.5 transition-colors hover:bg-static/50"
                >
                  <span aria-hidden className="text-sm text-hype">
                    ↗
                  </span>
                  <span className="font-display text-xs font-bold uppercase tracking-wide text-bone">
                    View on explorer
                  </span>
                </a>
                <MenuItem
                  icon="⏻"
                  title="Disconnect"
                  danger
                  onClick={() => {
                    wallet.disconnect();
                    setOpen(false);
                  }}
                />
              </div>
            </Popover>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ---------------------------------------------------------- disconnected
  return (
    <div ref={ref} className={compact ? "relative" : "relative w-full"}>
      <Button
        onClick={() => setOpen((v) => !v)}
        loading={wallet.privyLoading || busy !== null}
        aria-haspopup="menu"
        aria-expanded={open}
        className={compact ? "!px-3 !py-2 text-xs" : "w-full !py-2 text-xs"}
      >
        Connect
      </Button>

      <AnimatePresence>
        {open && (
          <Popover compact={compact}>
            {wallet.privyAvailable && (
              <MenuItem
                icon="✦"
                title="Email or social"
                hint={
                  busy === "privy" ? "waiting for Privy…" : "no wallet needed"
                }
                disabled={busy !== null || wallet.privyLoading}
                onClick={() => connect("privy")}
              />
            )}
            <MenuItem
              icon="🦊"
              title="MetaMask"
              hint={
                wallet.metaMaskAvailable
                  ? busy === "metamask"
                    ? "confirm in the extension…"
                    : "browser extension"
                  : "not detected"
              }
              disabled={!wallet.metaMaskAvailable || busy !== null}
              onClick={() => connect("metamask")}
            />
            {wallet.burnerAvailable && (
              <MenuItem
                icon="◇"
                title="Guest wallet"
                hint="throwaway key, studionet only"
                disabled={busy !== null}
                onClick={() => connect("burner")}
              />
            )}
            {!wallet.privyAvailable && !wallet.metaMaskAvailable && (
              <p className="px-3 py-2 font-mono text-[10px] text-bone/40">
                No wallet available —{" "}
                <a
                  href="https://metamask.io"
                  target="_blank"
                  rel="noreferrer"
                  className="text-pulse underline"
                >
                  install MetaMask
                </a>
              </p>
            )}
          </Popover>
        )}
      </AnimatePresence>
    </div>
  );
}
