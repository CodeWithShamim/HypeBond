import { TransactionStatus } from "genlayer-js/types";
import {
  parseDeal,
  parseDealList,
  type Deal,
  type Platform,
} from "@hypebond/shared";
import {
  CONTRACT_ADDRESS,
  ensureConsensus,
  ensureCorrectChain,
  genlayerClient,
  readClient,
  type WalletKind,
} from "./genlayer";

// ---------------------------------------------------------------- reads

async function read(functionName: string, args: unknown[]): Promise<unknown> {
  return readClient().readContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args: args as never[],
  });
}

/**
 * The contract caps a single page at 50 (`_page_deals`), and the per-user
 * index is append-ordered — so a one-shot read of offset 0 returns a user's
 * OLDEST 50 bonds and silently hides every newer one. Anything showing "your
 * bonds" has to walk the pages.
 */
const PAGE = 50;
const MAX_PAGES = 40; // 2000 deals for one user; a stop, not an expectation

async function readAllPages(
  page: (offset: number, limit: number) => Promise<Deal[]>
): Promise<Deal[]> {
  const out: Deal[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const batch = await page(i * PAGE, PAGE);
    out.push(...batch);
    if (batch.length < PAGE) break; // short page = last page
  }
  return out;
}

export const reads = {
  deal: async (id: number): Promise<Deal | null> =>
    parseDeal(await read("get_deal", [id])),
  brandDeals: async (addr: string, offset = 0, limit = 50): Promise<Deal[]> =>
    parseDealList(await read("get_brand_deals", [addr, offset, limit])),
  influencerDeals: async (
    addr: string,
    offset = 0,
    limit = 50
  ): Promise<Deal[]> =>
    parseDealList(await read("get_influencer_deals", [addr, offset, limit])),
  allBrandDeals: (addr: string): Promise<Deal[]> =>
    readAllPages((offset, limit) => reads.brandDeals(addr, offset, limit)),
  allInfluencerDeals: (addr: string): Promise<Deal[]> =>
    readAllPages((offset, limit) => reads.influencerDeals(addr, offset, limit)),
  dealCount: async (): Promise<number> => {
    const v = await read("get_deal_count", []);
    return typeof v === "bigint" ? Number(v) : typeof v === "number" ? v : 0;
  },
};

// ---------------------------------------------------------------- writes

export interface WriteOptions {
  kind: WalletKind;
  address: `0x${string}`;
}

/**
 * A rolled-back GenVM call still reaches ACCEPTED consensus, so failure lives
 * in the receipt, not the status. The leader receipt's `result` is either a
 * base64 blob (byte 0 = result code, rest = utf-8 message) or, on studionet,
 * already decoded by genlayer-js to `{ status, payload }`.
 */
const RESULT_ERROR_STATUSES = new Set(["rollback", "contract_error", "error"]);
const RESULT_CODE_TO_STATUS: Record<number, string> = {
  1: "rollback",
  2: "contract_error",
  3: "error",
};

function decodeResultBase64(b64: string): { status: string; payload: string } | null {
  try {
    const bin = atob(b64);
    if (!bin.length) return null;
    const status = RESULT_CODE_TO_STATUS[bin.charCodeAt(0)];
    if (!status) return null;
    const bytes = Uint8Array.from(bin.slice(1), (c) => c.charCodeAt(0));
    return { status, payload: new TextDecoder().decode(bytes) };
  } catch {
    return null;
  }
}

export function extractGenVmError(receipt: unknown): string | null {
  const tx = receipt as {
    consensus_data?: { leader_receipt?: unknown };
    txExecutionResultName?: string;
  } | null;
  const lr = tx?.consensus_data?.leader_receipt;
  const leaderReceipts = Array.isArray(lr) ? lr : lr ? [lr] : [];
  for (const r of leaderReceipts) {
    const { result, execution_result } = r as {
      result?: unknown;
      execution_result?: string;
    };
    const decoded =
      typeof result === "string"
        ? decodeResultBase64(result)
        : result && typeof result === "object"
        ? (result as { status?: string; payload?: unknown })
        : null;
    if (decoded?.status && RESULT_ERROR_STATUSES.has(decoded.status)) {
      return typeof decoded.payload === "string" && decoded.payload
        ? decoded.payload
        : `Transaction ${decoded.status.replace("_", " ")}`;
    }
    if (/^(ERROR|FINISHED_WITH_ERROR)$/i.test(execution_result ?? ""))
      return "Transaction execution failed";
  }
  if (tx?.txExecutionResultName === "FINISHED_WITH_ERROR")
    return "Transaction execution failed";
  return null;
}

async function write(
  { kind, address }: WriteOptions,
  functionName: string,
  args: unknown[],
  value: bigint = 0n
): Promise<string> {
  const client = genlayerClient(kind, address);
  // The user may have switched networks since connecting.
  await ensureCorrectChain(kind);
  await ensureConsensus(client);
  const hash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args: args as never[],
    value,
  });
  const receipt = await client.waitForTransactionReceipt({
    hash: hash as never,
    status: TransactionStatus.ACCEPTED,
    retries: 200,
    interval: 3000,
  });
  const failure = extractGenVmError(receipt);
  if (failure) throw new Error(failure);
  return hash as string;
}

export const writes = {
  createDeal: (
    w: WriteOptions,
    influencer: string,
    terms: string,
    platform: Platform,
    minLiveDays: number,
    escrow: bigint
  ) =>
    write(w, "create_deal", [influencer, terms, platform, minLiveDays], escrow),
  submitPost: (w: WriteOptions, dealId: number, postUrl: string) =>
    write(w, "submit_post", [dealId, postUrl]),
  recheckPost: (w: WriteOptions, dealId: number) =>
    write(w, "recheck_post", [dealId]),
  finalize: (w: WriteOptions, dealId: number) =>
    write(w, "finalize", [dealId]),
  cancelDeal: (w: WriteOptions, dealId: number) =>
    write(w, "cancel_deal", [dealId]),
  declineDeal: (w: WriteOptions, dealId: number) =>
    write(w, "decline_deal", [dealId]),
  claimTimeout: (w: WriteOptions, dealId: number) =>
    write(w, "claim_timeout", [dealId]),
  pruneDeals: (w: WriteOptions, maxSteps: number) =>
    write(w, "prune_deals", [maxSteps]),
};

/**
 * Highest deal id belonging to this brand.
 *
 * `offset` indexes the brand's OWN deal array, not the global deal list, so
 * it has to be walked from 0 — a global count would skip straight past a
 * brand with only a handful of deals and come back empty.
 */
export async function latestBrandDealId(addr: string): Promise<number | null> {
  let best: number | null = null;
  for (const d of await reads.allBrandDeals(addr)) {
    if (best === null || d.id > best) best = d.id;
  }
  return best;
}

/**
 * Resolve the id that a just-accepted `create_deal` minted.
 *
 * `knownBefore` is the brand's highest id read *before* the write. Reads can
 * lag the transaction they just confirmed, and the pre-existing maximum is a
 * perfectly plausible-looking answer — it would hand the brand a link to one
 * of their older bonds and let them share it as the new deal. So only an id
 * that actually ADVANCED counts; short of that, poll briefly and then report
 * "unknown" rather than guessing.
 */
export async function awaitNewBrandDealId(
  addr: string,
  knownBefore: number | null,
  attempts = 5,
  delayMs = 2000
): Promise<number | null> {
  for (let i = 0; i < attempts; i++) {
    const latest = await latestBrandDealId(addr);
    if (latest !== null && (knownBefore === null || latest > knownBefore))
      return latest;
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}
