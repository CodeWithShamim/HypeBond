import { useCallback, useMemo, useRef, type ReactNode } from "react";
import {
  PrivyProvider,
  useLogin,
  useLogout,
  usePrivy,
  useWallets,
  type PrivyClientConfig,
  type User,
} from "@privy-io/react-auth";
import { CHAIN, type ExternalWallet } from "./genlayer";

export const PRIVY_APP_ID = (import.meta.env.VITE_PRIVY_APP_ID ?? "").trim();

/** Without an app id there is no Privy project to talk to, so the whole
 * integration stays dark and the app falls back to MetaMask / guest. */
export const PRIVY_CONFIGURED = PRIVY_APP_ID.length > 0;

/**
 * GenLayer chain definitions are already viem-shaped (id, name, nativeCurrency,
 * rpcUrls, blockExplorers) plus consensus-contract extras Privy ignores. Typing
 * through `PrivyClientConfig` avoids taking a direct dependency on viem, which
 * apps/web only has transitively.
 */
type PrivyChain = NonNullable<PrivyClientConfig["supportedChains"]>[number];
const GENLAYER_CHAIN = CHAIN as unknown as PrivyChain;

const config: PrivyClientConfig = {
  appearance: {
    theme: "#0D0B14", // void
    accentColor: "#FF3D8A", // hype
    landingHeader: "Connect to HypeBond",
    loginMessage: "Bond the hype. Escrow, verified by AI validators.",
    walletList: ["detected_wallets", "metamask", "coinbase_wallet", "rainbow", "wallet_connect"],
  },
  loginMethods: ["email", "google", "twitter", "wallet"],
  // Creators arriving from a social post have no wallet and no reason to
  // install one; an embedded wallet is what makes the link shareable at all.
  embeddedWallets: {
    ethereum: { createOnLogin: "users-without-wallets" },
    showWalletUIs: true,
  },
  supportedChains: [GENLAYER_CHAIN],
  defaultChain: GENLAYER_CHAIN,
};

/**
 * Wraps the tree in Privy when an app id is configured, and is a pass-through
 * when it isn't — so a checkout without `VITE_PRIVY_APP_ID` still boots.
 */
export function PrivyAuthProvider({ children }: { children: ReactNode }) {
  if (!PRIVY_CONFIGURED) return <>{children}</>;
  return (
    <PrivyProvider appId={PRIVY_APP_ID} config={config}>
      {children}
    </PrivyProvider>
  );
}

// ---------------------------------------------------------------- bridge

export interface PrivyBridge {
  /** False when the SDK isn't mounted at all (no app id). */
  available: boolean;
  /** Privy has finished restoring any prior session. */
  ready: boolean;
  authenticated: boolean;
  address: `0x${string}` | null;
  /** Chain id of the active wallet, CAIP-2 (`eip155:4221`). */
  chainId: string | null;
  /** How the user got here — "you@mail.com", "@handle", "MetaMask". */
  label: string | null;
  /** Whether the active wallet is a Privy-managed embedded wallet. */
  embedded: boolean;
  /** Resolves when the modal closes: fulfilled on login *and* on cancel. */
  login: () => Promise<void>;
  logout: () => Promise<void>;
  /** Signer + network control for the active wallet, or null if there is none. */
  connectExternalWallet: () => Promise<ExternalWallet | null>;
}

const UNAVAILABLE: PrivyBridge = {
  available: false,
  ready: true,
  authenticated: false,
  address: null,
  chainId: null,
  label: null,
  embedded: false,
  login: async () => {
    throw new Error("Privy is not configured — set VITE_PRIVY_APP_ID");
  },
  logout: async () => undefined,
  connectExternalWallet: async () => null,
};

function useNoPrivy(): PrivyBridge {
  return UNAVAILABLE;
}

/** Closing the modal is a normal outcome, not a failure to report. */
const CANCELLED = new Set([
  "exited_auth_flow",
  "exited_link_flow",
  "user_exited_auth_flow",
  "user_exited_link_flow",
]);

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

function usePrivyBridgeImpl(): PrivyBridge {
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();

  // useLogin's callbacks are the only signal that the modal resolved, so a
  // deferred turns them back into an awaitable the connect button can show a
  // spinner against and surface errors from.
  const pending = useRef<{
    resolve: () => void;
    reject: (e: Error) => void;
  } | null>(null);

  const settle = useCallback((err?: Error) => {
    const p = pending.current;
    pending.current = null;
    if (!p) return;
    if (err) p.reject(err);
    else p.resolve();
  }, []);

  const { login: openLogin } = useLogin({
    onComplete: () => settle(),
    onError: (code) =>
      settle(CANCELLED.has(String(code)) ? undefined : new Error(String(code))),
  });
  const { logout: privyLogout } = useLogout();

  /**
   * The wallet the user actually transacts with. `user.wallet` is the first
   * verified wallet on the account and is what Privy treats as primary, so
   * prefer it over connection order — otherwise linking a second wallet
   * silently moves which address the app writes from.
   */
  const active = useMemo(() => {
    if (!wallets.length) return undefined;
    const primary = user?.wallet?.address?.toLowerCase();
    return (
      wallets.find((w) => w.address.toLowerCase() === primary) ?? wallets[0]
    );
  }, [wallets, user?.wallet?.address]);

  const login = useCallback(
    () =>
      new Promise<void>((resolve, reject) => {
        // A second click while the modal is open would orphan the first
        // deferred; resolve it rather than leaving it hanging forever.
        settle();
        pending.current = { resolve, reject };
        openLogin();
      }),
    [openLogin, settle]
  );

  const logout = useCallback(async () => {
    await privyLogout();
  }, [privyLogout]);

  const connectExternalWallet = useCallback(async (): Promise<ExternalWallet | null> => {
    if (!active) return null;
    const provider = await active.getEthereumProvider();
    return {
      provider: provider as ExternalWallet["provider"],
      switchChain: () => active.switchChain(CHAIN.id),
    };
  }, [active]);

  return {
    available: true,
    ready,
    authenticated,
    address: (active?.address as `0x${string}`) ?? null,
    chainId: active?.chainId ?? null,
    label: describeUser(user),
    embedded: active?.walletClientType?.startsWith("privy") ?? false,
    login,
    logout,
    connectExternalWallet,
  };
}

/**
 * Picked once at module load, never per render: Privy's hooks throw outside
 * `PrivyProvider`, and swapping implementations mid-run would break the rules
 * of hooks. `PRIVY_CONFIGURED` is build-time constant, so this is stable.
 */
export const usePrivyBridge: () => PrivyBridge = PRIVY_CONFIGURED
  ? usePrivyBridgeImpl
  : useNoPrivy;
