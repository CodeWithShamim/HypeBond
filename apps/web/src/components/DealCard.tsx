import { Link } from "react-router-dom";
import { dealSerial, PLATFORM_LABELS, type Deal } from "@hypebond/shared";
import { formatGen, shortAddr, formatDate } from "@/lib/format";
import { StickerCard, StatusChip } from "./ui";
import { PlatformIcon } from "./PlatformTile";

/** Sticker-style deal card for the dashboard grids. */
export function DealCard({ deal }: { deal: Deal }) {
  return (
    <Link to={`/deal/${deal.id}`} className="block focus-visible:outline-none">
      <StickerCard hover className="h-full p-5">
        <div className="flex items-start justify-between gap-3">
          <span className="flex items-center gap-2 text-bone/60">
            <PlatformIcon platform={deal.platform} size={18} />
            <span className="font-mono text-xs uppercase tracking-widest">
              {PLATFORM_LABELS[deal.platform]}
            </span>
          </span>
          <StatusChip status={deal.status} />
        </div>
        <p className="mt-4 font-mono text-xs text-bone/40">{dealSerial(deal.id)}</p>
        <p className="mt-1 font-display text-3xl font-bold tracking-tight text-bone">
          {formatGen(deal.amount)}
          <span className="ml-1.5 text-base text-bone/40">GEN</span>
        </p>
        <div className="mt-4 space-y-1 font-mono text-xs text-bone/50">
          <p>brand {shortAddr(deal.brand)}</p>
          <p>creator {shortAddr(deal.influencer)}</p>
          <p>created {formatDate(deal.created_at)}</p>
        </div>
      </StickerCard>
    </Link>
  );
}
