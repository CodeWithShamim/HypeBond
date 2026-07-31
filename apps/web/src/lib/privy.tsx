import { Suspense, lazy, useSyncExternalStore } from "react";
import type { User } from "@privy-io/react-auth";
import type { ExternalWallet } from "./genlayer";

export const PRIVY_APP_ID = (import.meta.env.VITE_PRIVY_APP_ID ?? "").trim();

/** Without an app id there is no Privy project to talk to, so the whole
 * integration stays dark and the app falls back to MetaMask / guest. */
export const PRIVY_CONFIGURED = PRIVY_APP_ID.length > 0;

export interface PrivyBridge {
  /** False when the SDK isn't configured, or isn't loaded yet. */
  available: boolean;
  /** Privy has finished restoring any prior session. */
  ready: boolean;
  authenticated: boolean;
  address: `0x${string}` | null;
  /** Chain id of the active wallet, CAIP-2 (`eip155:4221`). */
  chainId: string | null;
  /** How the user got here — "you@mail.com", "@handle", "coinbase wallet". */
  label: string | null;
  /** Whether the active wallet is a Privy-managed embedded wallet. */
  embedded: boolean;
  /**
   * Resolves when the modal closes — true if the user signed in, false if they
   * backed out. Reported directly rather than read back off this snapshot,
   * which is a render behind at that moment.
   */
  login: () => Promise<boolean>;
  logout: () => Promise<void>;
  /** Signer + network control for the active wallet, or null if there is none. */
  connectExternalWallet: () => Promise<ExternalWallet | null>;
}

const OFFLINE: PrivyBridge = {
  available: false,
  ready: !PRIVY_CONFIGURED, // nothing to wait for when it's switched off
  authenticated: false,
  address: null,
  chainId: null,
  label: null,
  embedded: false,
  login: async (): Promise<boolean> => {
    throw new Error("Privy is not configured — set VITE_PRIVY_APP_ID");
  },
  logout: async () => undefined,
  connectExternalWallet: async () => null,
};

// ------------------------------------------------------- external store
//
// The SDK is ~700 kB gzipped and lazily mounted (see PrivyAuthMount), so the
// live session can't come down through React context — the app tree renders
// long before the provider exists, and re-parenting it later would remount
// every page and throw away in-progress form state. Instead the mounted
// bridge publishes into this store and consumers subscribe to it, leaving the
// app tree untouched whenever Privy arrives.

let snapshot: PrivyBridge = OFFLINE;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => void listeners.delete(l);
}

/** Called by the mounted bridge; identity-stable between real changes. */
export function publishPrivySnapshot(next: PrivyBridge | null): void {
  snapshot = next ?? OFFLINE;
  emit();
}

export function getPrivySnapshot(): PrivyBridge {
  return snapshot;
}

export function usePrivyBridge(): PrivyBridge {
  return useSyncExternalStore(subscribe, getPrivySnapshot, getPrivySnapshot);
}

// ------------------------------------------------------------ lazy mount

const PrivyRoot = lazy(() => import("./privyRoot"));

let mountRequested = false;
const mountListeners = new Set<() => void>();

/**
 * Ask for the SDK to be mounted. Cheap and idempotent — call it on a restored
 * Privy session at boot, and again when the user reaches for the wallet.
 */
export function requestPrivyMount(): void {
  if (!PRIVY_CONFIGURED || mountRequested) return;
  mountRequested = true;
  for (const l of mountListeners) l();
}

/** Warm the chunk without mounting, e.g. when the connect menu opens. */
export function preloadPrivy(): void {
  if (PRIVY_CONFIGURED) void import("./privyRoot");
}

const PRIVY_LOAD_TIMEOUT_MS = 20_000;

/** Mount the SDK if needed and wait for it to finish restoring its session. */
function whenPrivyReady(): Promise<PrivyBridge> {
  requestPrivyMount();
  if (snapshot.available && snapshot.ready) return Promise.resolve(snapshot);
  return new Promise((resolve, reject) => {
    const stop = subscribe(() => {
      if (!snapshot.available || !snapshot.ready) return;
      done();
      resolve(snapshot);
    });
    const timer = setTimeout(() => {
      done();
      reject(new Error("Could not reach Privy — check your connection"));
    }, PRIVY_LOAD_TIMEOUT_MS);
    function done() {
      clearTimeout(timer);
      stop();
    }
  });
}

const WALLET_MINT_TIMEOUT_MS = 15_000;

/**
 * Wait for the active wallet to appear after a login. Privy resolves the login
 * flow before an embedded wallet has finished being minted, so this closes the
 * window where the app is authenticated but has no address to transact with.
 *
 * It waits purely on the address, never on `authenticated`. The store is
 * published from an effect, so at the instant Privy reports the login complete
 * the snapshot still says signed-out — reading it here would short-circuit and
 * hand the caller a session with no wallet in it, which is exactly the flicker
 * this exists to prevent. Whether the login succeeded is the caller's to know.
 *
 * Resolves rather than rejects on timeout: a wallet that shows up late is
 * still picked up by the session sync, and a stuck spinner helps nobody.
 */
function whenPrivyWallet(): Promise<void> {
  if (snapshot.address) return Promise.resolve();
  return new Promise((resolve) => {
    const stop = subscribe(() => {
      if (!snapshot.address) return;
      done();
      resolve();
    });
    const timer = setTimeout(() => {
      done();
      resolve();
    }, WALLET_MINT_TIMEOUT_MS);
    function done() {
      clearTimeout(timer);
      stop();
    }
  });
}

let pendingLogout: Promise<void> | null = null;

/**
 * End the Privy session. The app clears its own wallet state immediately, so
 * this is fire-and-forget — but the promise is kept so a user who disconnects
 * and immediately reconnects doesn't get logged straight back into the session
 * they were leaving.
 */
export function logoutFromPrivy(): Promise<void> {
  const done = snapshot
    .logout()
    // Swallowed on purpose: wallet state is already cleared locally, and the
    // caller fires this without awaiting — a rejection here has no one to tell.
    .catch(() => undefined)
    .then(() => {
      if (pendingLogout === done) pendingLogout = null;
    });
  pendingLogout = done;
  return done;
}

/**
 * Open the Privy login modal, loading the SDK first if this is the user's
 * first reach for it. Resolves once the flow is settled: a usable wallet is in
 * hand, or the user backed out.
 */
export async function loginWithPrivy(): Promise<void> {
  // Never race a disconnect that hasn't landed yet.
  await pendingLogout;
  const bridge = await whenPrivyReady();
  const signedIn = await bridge.login();
  if (signedIn) await whenPrivyWallet();
}

function useMountRequested(): boolean {
  return useSyncExternalStore(
    (l) => {
      mountListeners.add(l);
      return () => void mountListeners.delete(l);
    },
    () => mountRequested,
    () => false
  );
}

/**
 * Mount point for the Privy SDK. Renders no app UI of its own — Privy's modal
 * goes to a portal — so it can sit as a leaf beside the app and appear
 * whenever it's needed without disturbing anything already on screen.
 */
export function PrivyAuthMount() {
  const requested = useMountRequested();
  if (!PRIVY_CONFIGURED || !requested) return null;
  return (
    <Suspense fallback={null}>
      <PrivyRoot />
    </Suspense>
  );
}

// ---------------------------------------------------------------- helpers

/** Human label for however the user signed in. */
export function describeUser(user: User | null): string | null {
  if (!user) return null;
  if (user.email?.address) return user.email.address;
  if (user.google?.email) return user.google.email;
  if (user.twitter?.username) return `@${user.twitter.username}`;
  if (user.phone?.number) return user.phone.number;
  if (user.wallet?.walletClientType && user.wallet.walletClientType !== "privy")
    return user.wallet.walletClientType.replace(/_/g, " ");
  return null;
}
