import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loginWithPrivy,
  publishPrivySnapshot,
  type PrivyBridge,
} from "./privy";

/**
 * Privy's login callback fires a render *before* the store catches up, so at
 * the moment `login()` resolves the snapshot still reports a signed-out user
 * with no wallet. Anything in the connect path that reads the snapshot to
 * decide "are we done?" therefore returns too early — and the user who just
 * finished typing an email code watches the button flip back to "Connect"
 * while their embedded wallet is still being minted.
 *
 * These pin the ordering rather than the wiring: they drive the store the way
 * the mounted SDK does and assert `loginWithPrivy` only settles once there is
 * an address to transact with.
 */

const ADDRESS = `0x${"ab".repeat(20)}` as `0x${string}`;

function bridge(over: Partial<PrivyBridge> = {}): PrivyBridge {
  return {
    available: true,
    ready: true,
    authenticated: false,
    address: null,
    chainId: null,
    label: null,
    embedded: false,
    login: async () => true,
    logout: async () => undefined,
    connectExternalWallet: async () => null,
    ...over,
  };
}

const settled = (p: Promise<unknown>) => {
  let done = false;
  void p.then(() => (done = true));
  // Two turns: one for the awaited promise, one for the continuation after it.
  return () => new Promise<boolean>((r) => setTimeout(() => r(done), 0));
};

beforeEach(() => {
  publishPrivySnapshot(null);
});

describe("loginWithPrivy", () => {
  it("waits for the embedded wallet, not for the login callback", async () => {
    // Signed out, wallet-less: exactly what the store says when the email
    // code is accepted and Privy starts minting.
    publishPrivySnapshot(bridge({ login: async () => true }));

    const isSettled = settled(loginWithPrivy());
    expect(await isSettled()).toBe(false);

    // Privy catches up: authenticated, still no wallet. Still not done.
    publishPrivySnapshot(bridge({ authenticated: true }));
    expect(await isSettled()).toBe(false);

    // Wallet minted.
    publishPrivySnapshot(bridge({ authenticated: true, address: ADDRESS }));
    expect(await isSettled()).toBe(true);
  });

  it("returns immediately when the user backs out of the modal", async () => {
    publishPrivySnapshot(bridge({ login: async () => false }));

    const isSettled = settled(loginWithPrivy());

    // No wallet will ever arrive — a cancelled login must not hang.
    expect(await isSettled()).toBe(true);
  });

  it("gives up waiting rather than spinning forever", async () => {
    vi.useFakeTimers();
    try {
      publishPrivySnapshot(bridge({ login: async () => true }));
      const pending = loginWithPrivy();
      await vi.advanceTimersByTimeAsync(30_000);
      await expect(pending).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
