import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LIVE_STATUSES, type Deal, type Platform } from "@hypebond/shared";
import {
  awaitNewBrandDealId,
  latestBrandDealId,
  reads,
  writes,
  type WriteOptions,
} from "@/lib/contract";
import { CONTRACT_CONFIGURED } from "@/lib/genlayer";
import { useWallet } from "@/lib/wallet";
import { useToast } from "@/lib/toast";
import { errorMessage } from "@/lib/format";

// ---------------------------------------------------------------- queries

export function useDeal(id: number | null) {
  return useQuery({
    queryKey: ["deal", id],
    enabled: CONTRACT_CONFIGURED && id !== null && id > 0,
    queryFn: () => reads.deal(id as number),
    // Validator runs land asynchronously — poll while the deal is in motion.
    refetchInterval: (q) => {
      const d = q.state.data as Deal | null | undefined;
      if (!d) return false;
      return LIVE_STATUSES.includes(d.status) ? 10_000 : false;
    },
  });
}

// The contract pages at 50 and its per-user index is append-ordered, so a
// single offset-0 read returns the user's OLDEST 50 bonds and hides newer
// ones entirely. Both dashboard lists walk every page.
export function useBrandDeals(addr: string | null) {
  return useQuery({
    queryKey: ["brandDeals", addr],
    enabled: CONTRACT_CONFIGURED && !!addr,
    queryFn: () => reads.allBrandDeals(addr as string),
    refetchInterval: 30_000,
  });
}

export function useInfluencerDeals(addr: string | null) {
  return useQuery({
    queryKey: ["influencerDeals", addr],
    enabled: CONTRACT_CONFIGURED && !!addr,
    queryFn: () => reads.allInfluencerDeals(addr as string),
    refetchInterval: 30_000,
  });
}

// ---------------------------------------------------------------- mutations

function useWriteOptions(): () => WriteOptions {
  const { address, kind } = useWallet();
  return () => {
    if (!address) throw new Error("Connect a wallet first");
    return { kind, address };
  };
}

/** Shared toast + invalidate plumbing. Reuses the same verb pending→done. */
function useChainMutation<TArgs, TResult>(
  verb: string,
  fn: (w: WriteOptions, args: TArgs) => Promise<TResult>
) {
  const toast = useToast();
  const qc = useQueryClient();
  const getW = useWriteOptions();
  return useMutation({
    mutationFn: async (args: TArgs) => {
      const id = toast.push("pending", `${verb}…`, "waiting for the chain");
      try {
        const result = await fn(getW(), args);
        toast.update(id, "success", verb, "confirmed on-chain");
        return result;
      } catch (err) {
        toast.update(id, "error", `${verb} failed`, errorMessage(err));
        throw err;
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["deal"] });
      qc.invalidateQueries({ queryKey: ["brandDeals"] });
      qc.invalidateQueries({ queryKey: ["influencerDeals"] });
    },
  });
}

export interface CreateDealArgs {
  influencer: string;
  terms: string;
  platform: Platform;
  minLiveDays: number;
  escrow: bigint;
}

/** Create + fund a deal, then resolve the freshly minted deal id. */
export function useCreateDeal() {
  const { address } = useWallet();
  return useChainMutation<CreateDealArgs, number | null>(
    "Bond created",
    async (w, a) => {
      // Snapshot first: reads can lag the write, and without a "before" to
      // compare against, a lagging read returns one of the brand's OLDER
      // bonds — indistinguishable from the new one, and shareable as it.
      const before = await latestBrandDealId(address as string);
      await writes.createDeal(
        w,
        a.influencer,
        a.terms,
        a.platform,
        a.minLiveDays,
        a.escrow
      );
      return awaitNewBrandDealId(address as string, before);
    }
  );
}

export function useSubmitPost() {
  return useChainMutation<{ dealId: number; postUrl: string }, string>(
    "Post submitted",
    (w, a) => writes.submitPost(w, a.dealId, a.postUrl)
  );
}

export function useRecheckPost() {
  return useChainMutation<{ dealId: number }, string>("Recheck run", (w, a) =>
    writes.recheckPost(w, a.dealId)
  );
}

export function useFinalize() {
  return useChainMutation<{ dealId: number }, string>("Finalized", (w, a) =>
    writes.finalize(w, a.dealId)
  );
}

export function useCancelDeal() {
  return useChainMutation<{ dealId: number }, string>("Bond cancelled", (w, a) =>
    writes.cancelDeal(w, a.dealId)
  );
}

export function useClaimTimeout() {
  return useChainMutation<{ dealId: number }, string>(
    "Timeout claimed",
    (w, a) => writes.claimTimeout(w, a.dealId)
  );
}
