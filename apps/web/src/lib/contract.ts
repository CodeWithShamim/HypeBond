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
  if (kind === "metamask") await ensureCorrectChain();
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
  claimTimeout: (w: WriteOptions, dealId: number) =>
    write(w, "claim_timeout", [dealId]),
};

/**
 * After create_deal: newest deal id for this brand (the one just minted).
 *
 * `offset` indexes the brand's OWN deal array, not the global deal list, so
 * it has to be walked from 0 — a global count would skip straight past a
 * brand with only a handful of deals and come back empty.
 */
const PAGE = 50;
const MAX_PAGES = 40; // 2000 deals for one brand; a stop, not an expectation

export async function latestBrandDealId(addr: string): Promise<number | null> {
  let best: number | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const deals = await reads.brandDeals(addr, page * PAGE, PAGE);
    for (const d of deals) if (best === null || d.id > best) best = d.id;
    if (deals.length < PAGE) break; // short page = last page
  }
  return best;
}
