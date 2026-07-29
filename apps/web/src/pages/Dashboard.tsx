import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { useBrandDeals, useInfluencerDeals } from "@/hooks/useHypebond";
import { useWallet } from "@/lib/wallet";
import { CONTRACT_CONFIGURED } from "@/lib/genlayer";
import { PageItem } from "@/components/motion/PageTransition";
import { BondingLoader } from "@/components/motion/BondingLoader";
import { DealCard } from "@/components/DealCard";
import { Button, EmptyState, ErrorStrip } from "@/components/ui";

type Tab = "brand" | "influencer";

export function Dashboard() {
  const wallet = useWallet();
  const reduced = useReducedMotion();
  const [tab, setTab] = useState<Tab>("brand");

  const brand = useBrandDeals(wallet.address);
  const influencer = useInfluencerDeals(wallet.address);
  const active = tab === "brand" ? brand : influencer;

  if (!CONTRACT_CONFIGURED) {
    return (
      <EmptyState
        title="No contract configured"
        body="Deploy hypebond.py and set VITE_HYPEBOND_ADDRESS in the repo-root .env."
      />
    );
  }

  if (!wallet.address) {
    return (
      <EmptyState
        title="Connect to see your bonds"
        body="Your dashboard is keyed to your wallet — bonds you funded as a brand and bonds where you're the creator."
      />
    );
  }

  const deals = [...(active.data ?? [])].sort((a, b) => b.id - a.id);

  return (
    <div className="space-y-6">
      <PageItem>
        <h1 className="font-display text-4xl font-bold uppercase tracking-tight text-bone">
          Your <span className="text-bond">bonds</span>
        </h1>
      </PageItem>

      {/* tabs */}
      <PageItem>
        <div className="relative inline-flex rounded-card border-2 border-static p-1">
          {(
            [
              ["brand", "As brand"],
              ["influencer", "As creator"],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`relative z-10 rounded-lg px-5 py-2 font-display text-sm font-bold uppercase tracking-wide transition-colors ${
                tab === key ? "text-void" : "text-bone/60 hover:text-bone"
              }`}
            >
              {tab === key && (
                <motion.span
                  layoutId={reduced ? undefined : "tab-pill"}
                  className="absolute inset-0 -z-10 rounded-lg bg-bond"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              {label}
            </button>
          ))}
        </div>
      </PageItem>

      <PageItem>
        {active.isLoading ? (
          <div className="flex justify-center py-20">
            <BondingLoader lines={["pulling your bonds…", "reading the chain…"]} />
          </div>
        ) : active.isError ? (
          <ErrorStrip>Could not load deals: {String(active.error)}</ErrorStrip>
        ) : deals.length === 0 ? (
          <EmptyState
            title="No bonds yet"
            body={
              tab === "brand"
                ? "Start one and make the deal check itself — escrow in, post out, validators referee."
                : "When a brand bonds a deal to your wallet, it shows up here ready for your post."
            }
            action={
              tab === "brand" ? (
                <Link to="/new">
                  <Button>Start a bond</Button>
                </Link>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {deals.map((d) => (
              <DealCard key={d.id} deal={d} />
            ))}
          </div>
        )}
      </PageItem>
    </div>
  );
}
