import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  PrivyProvider,
  useLogin,
  useLogout,
  usePrivy,
  useWallets,
  type PrivyClientConfig,
} from "@privy-io/react-auth";
import { CHAIN, type ExternalWallet } from "./genlayer";
import {
  PRIVY_APP_ID,
  describeUser,
  publishPrivySnapshot,
  type PrivyBridge,
} from "./privy";

/**
 * Everything that statically imports the Privy SDK lives in this module, and
 * nothing imports it statically in turn — so the ~700 kB bundle stays behind
 * the dynamic import in `privy.tsx` instead of landing on the home page.
 */

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
  // A creator who was sent a bond link has an email, not a browser extension.
  // The embedded wallet is what makes that link acceptable without installing
  // anything, so it's minted for anyone arriving without a wallet.
  embeddedWallets: {
    ethereum: { createOnLogin: "users-without-wallets" },
    showWalletUIs: true,
  },
  supportedChains: [GENLAYER_CHAIN],
  defaultChain: GENLAYER_CHAIN,
};

/** Closing the modal is a normal outcome, not a failure to report. */
const CANCELLED = new Set([
  "exited_auth_flow",
  "exited_link_flow",
  "user_exited_auth_flow",
  "user_exited_link_flow",
]);

/**
 * Reads Privy's hooks and publishes them to the store `usePrivyBridge` reads.
 * Renders nothing: the app tree lives outside this provider.
 */
function SessionBridge() {
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();

  // useLogin's callbacks are the only signal that the modal resolved, so a
  // deferred turns them back into an awaitable the connect button can show a
  // spinner against and surface errors from.
  const pending = useRef<{
    resolve: (signedIn: boolean) => void;
    reject: (e: Error) => void;
  } | null>(null);

  const settle = useCallback((result: boolean | Error) => {
    const p = pending.current;
    pending.current = null;
    if (!p) return;
    if (result instanceof Error) p.reject(result);
    else p.resolve(result);
  }, []);

  const { login: openLogin } = useLogin({
    onComplete: () => settle(true),
    onError: (code) =>
      settle(CANCELLED.has(String(code)) ? false : new Error(String(code))),
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
    return wallets.find((w) => w.address.toLowerCase() === primary) ?? wallets[0];
  }, [wallets, user?.wallet?.address]);

  const login = useCallback(
    () =>
      new Promise<boolean>((resolve, reject) => {
        // A second click while the modal is open would orphan the first
        // deferred; settle it rather than leaving it hanging forever.
        settle(false);
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

  const bridge = useMemo<PrivyBridge>(
    () => ({
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
    }),
    [ready, authenticated, user, active, login, logout, connectExternalWallet]
  );

  useEffect(() => {
    publishPrivySnapshot(bridge);
  }, [bridge]);

  useEffect(() => () => publishPrivySnapshot(null), []);

  return null;
}

export default function PrivyRoot() {
  return (
    <PrivyProvider appId={PRIVY_APP_ID} config={config}>
      <SessionBridge />
    </PrivyProvider>
  );
}
