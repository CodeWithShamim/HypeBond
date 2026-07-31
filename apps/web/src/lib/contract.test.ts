import { beforeEach, describe, expect, it, vi } from "vitest";

const { readContract } = vi.hoisted(() => ({ readContract: vi.fn() }));

vi.mock("./genlayer", () => ({
  CONTRACT_ADDRESS: `0x${"11".repeat(20)}` as `0x${string}`,
  CONTRACT_CONFIGURED: true,
  readClient: () => ({ readContract }),
  genlayerClient: () => ({}),
  ensureConsensus: async () => undefined,
  ensureCorrectChain: async () => undefined,
}));

import {
  awaitNewBrandDealId,
  extractGenVmError,
  latestBrandDealId,
  reads,
} from "./contract";

/**
 * A rolled-back GenVM call still reaches ACCEPTED consensus, so the only
 * signal that a transaction failed lives in the leader receipt. If
 * extractGenVmError misses a failure the UI reports "confirmed on-chain"
 * for a transaction that did nothing — the single worst lie this app can
 * tell — so every shape the node might return is pinned here.
 */

/** Build the base64 `result` blob: byte 0 = status code, rest = utf-8 message. */
function resultBlob(code: number, message: string): string {
  const bytes = new TextEncoder().encode(message);
  let bin = String.fromCharCode(code);
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

const receiptWith = (leader: unknown) => ({
  consensus_data: { leader_receipt: leader },
});

describe("extractGenVmError", () => {
  it("returns null for a successful receipt", () => {
    expect(
      extractGenVmError(receiptWith([{ result: resultBlob(0, "") }]))
    ).toBeNull();
  });

  it("surfaces a rollback message from the base64 result blob", () => {
    const receipt = receiptWith([
      { result: resultBlob(1, "only the brand can cancel") },
    ]);
    expect(extractGenVmError(receipt)).toBe("only the brand can cancel");
  });

  it("surfaces contract_error and generic error codes", () => {
    expect(
      extractGenVmError(receiptWith([{ result: resultBlob(2, "boom") }]))
    ).toBe("boom");
    expect(
      extractGenVmError(receiptWith([{ result: resultBlob(3, "nope") }]))
    ).toBe("nope");
  });

  it("falls back to a readable status when the payload is empty", () => {
    const msg = extractGenVmError(receiptWith([{ result: resultBlob(1, "") }]));
    expect(msg).toBeTruthy();
    expect(msg).toMatch(/rollback/i);
  });

  it("handles a leader receipt that is an object rather than an array", () => {
    expect(
      extractGenVmError(receiptWith({ result: resultBlob(1, "reverted") }))
    ).toBe("reverted");
  });

  it("handles a result already decoded to { status, payload }", () => {
    expect(
      extractGenVmError(
        receiptWith([{ result: { status: "rollback", payload: "deal not found" } }])
      )
    ).toBe("deal not found");
  });

  it("treats an ok decoded status as success", () => {
    expect(
      extractGenVmError(
        receiptWith([{ result: { status: "return", payload: "1" } }])
      )
    ).toBeNull();
  });

  it("catches a failure reported only via execution_result", () => {
    expect(
      extractGenVmError(receiptWith([{ execution_result: "ERROR" }]))
    ).toBeTruthy();
    expect(
      extractGenVmError(receiptWith([{ execution_result: "FINISHED_WITH_ERROR" }]))
    ).toBeTruthy();
  });

  it("does not flag a successful execution_result", () => {
    expect(
      extractGenVmError(receiptWith([{ execution_result: "SUCCESS" }]))
    ).toBeNull();
  });

  it("catches a failure reported at the top level", () => {
    expect(
      extractGenVmError({ txExecutionResultName: "FINISHED_WITH_ERROR" })
    ).toBeTruthy();
  });

  it("reports the failure when any leader receipt in the list failed", () => {
    const receipt = receiptWith([
      { result: resultBlob(0, "") },
      { result: resultBlob(1, "second one reverted") },
    ]);
    expect(extractGenVmError(receipt)).toBe("second one reverted");
  });

  it("returns null rather than throwing on junk input", () => {
    for (const junk of [
      null,
      undefined,
      {},
      { consensus_data: {} },
      { consensus_data: { leader_receipt: null } },
      receiptWith([]),
      receiptWith([{}]),
      receiptWith([{ result: "!!!not base64!!!" }]),
      receiptWith([{ result: "" }]),
      receiptWith([{ result: 42 }]),
      receiptWith(["string receipt"]),
    ]) {
      expect(() => extractGenVmError(junk)).not.toThrow();
      expect(extractGenVmError(junk), JSON.stringify(junk)).toBeNull();
    }
  });

  it("decodes non-ASCII revert reasons correctly", () => {
    const receipt = receiptWith([
      { result: resultBlob(1, "terms must be 50–4000 characters") },
    ]);
    expect(extractGenVmError(receipt)).toBe("terms must be 50–4000 characters");
  });
});

// ---------------------------------------------------------------- paging

const ADDR = `0x${"ab".repeat(20)}`;

/** Minimal raw deal as the node returns it; only `id` matters here. */
const rawDeal = (id: number) => ({
  id,
  brand: ADDR,
  influencer: ADDR,
  amount: 1n,
  terms: "t",
  post_url: "",
  platform: "x",
  min_live_days: 3,
  created_at: 1,
  submitted_at: 0,
  verify_after: 0,
  grace_until: 0,
  last_check_at: 0,
  status: "FUNDED",
  verdict_reason: "",
  checks_passed: "",
  settled: false,
});

/** Serve `total` deals through the contract's 50-per-page view. */
function serveDeals(total: number) {
  readContract.mockImplementation(
    ({ args }: { args: [string, number, number] }) => {
      const [, offset, limit] = args;
      const ids = Array.from({ length: total }, (_, i) => i + 1);
      return Promise.resolve(
        ids.slice(offset, offset + Math.min(limit, 50)).map(rawDeal)
      );
    }
  );
}

describe("deal list paging", () => {
  beforeEach(() => {
    readContract.mockReset();
  });

  it("returns every page, not just the first 50", () => {
    // The per-user index is append-ordered, so a single offset-0 read hands
    // back the user's OLDEST 50 bonds and hides every newer one — the
    // dashboard would stop showing new deals the moment a brand passed 50.
    serveDeals(120);
    return reads.allBrandDeals(ADDR).then((deals) => {
      expect(deals).toHaveLength(120);
      expect(deals.at(-1)?.id).toBe(120);
    });
  });

  it("stops on a short page instead of paging forever", async () => {
    serveDeals(70);
    await reads.allBrandDeals(ADDR);
    expect(readContract).toHaveBeenCalledTimes(2);
  });

  it("makes exactly one call when the user has no deals", async () => {
    serveDeals(0);
    expect(await reads.allInfluencerDeals(ADDR)).toEqual([]);
    expect(readContract).toHaveBeenCalledTimes(1);
  });

  it("finds the highest id past the first page", async () => {
    serveDeals(60);
    expect(await latestBrandDealId(ADDR)).toBe(60);
  });
});

describe("awaitNewBrandDealId", () => {
  beforeEach(() => {
    readContract.mockReset();
  });

  it("returns the id only once it has advanced past the snapshot", async () => {
    let total = 3; // read still lagging the accepted write
    readContract.mockImplementation(() => {
      const deals = Array.from({ length: total }, (_, i) => rawDeal(i + 1));
      total = 4; // the next poll sees the new deal
      return Promise.resolve(deals);
    });
    expect(await awaitNewBrandDealId(ADDR, 3, 5, 0)).toBe(4);
  });

  it("reports unknown rather than handing back a pre-existing deal", async () => {
    // A lagging read returns the brand's previous maximum, which is a
    // perfectly plausible id — returning it would send them to an older bond
    // and let them share that link as the new deal.
    serveDeals(3);
    expect(await awaitNewBrandDealId(ADDR, 3, 3, 0)).toBeNull();
  });

  it("accepts the first id when the brand had none before", async () => {
    serveDeals(1);
    expect(await awaitNewBrandDealId(ADDR, null, 3, 0)).toBe(1);
  });
});
