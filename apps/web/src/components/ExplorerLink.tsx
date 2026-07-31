import { CONTRACT_ADDRESS, CONTRACT_CONFIGURED, explorerAddressUrl } from "@/lib/genlayer";
import { shortAddr } from "@/lib/format";

/**
 * Public link to the HypeBond contract on the GenLayer explorer. Every deal
 * action is an on-chain transaction, so this is open to anyone — connected or
 * not — which is the point: the escrow is auditable without trusting us.
 */
export function ExplorerLink({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  if (!CONTRACT_CONFIGURED) return null;

  const href = explorerAddressUrl(CONTRACT_ADDRESS);
  const label = "View the HypeBond contract and every transaction on the GenLayer explorer";

  if (compact) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={label}
        aria-label={label}
        className={`inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-card border-2 border-static px-3 py-2 font-mono text-xs text-bone/80 transition-colors hover:border-pulse hover:text-pulse ${className}`}
      >
        <span aria-hidden>⧉</span>
        <span className="hidden sm:inline">Explorer</span>
      </a>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={label}
      className={`group flex min-h-11 w-full items-center gap-2 rounded-card border-2 border-static px-3 py-2 font-mono text-xs text-bone/80 transition-colors hover:border-pulse hover:text-pulse ${className}`}
    >
      <span aria-hidden>⧉</span>
      <span>Explorer</span>
      <span className="ml-auto truncate text-bone/35 group-hover:text-pulse">
        {shortAddr(CONTRACT_ADDRESS)}
      </span>
    </a>
  );
}
