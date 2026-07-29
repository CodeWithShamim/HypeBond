import { describe, expect, it } from "vitest";
import { extractGenVmError } from "./contract";

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
