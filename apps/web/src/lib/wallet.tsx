import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createAccount } from "genlayer-js";
import {
  NETWORK,
  burnerPrivateKey,
  detectMetaMask,
  hasMetaMask,
  getEthereum,
  requestMetaMaskAccount,
  setExternalWallet,
  type WalletKind,
} from "./genlayer";
import {
  PRIVY_CONFIGURED,
  loginWithPrivy,
  logoutFromPrivy,
  requestPrivyMount,
  usePrivyBridge,
} from "./privy";

interface WalletState {
  address: `0x${string}` | null;
  kind: WalletKind;
  connecting: boolean;
  metaMaskAvailable: boolean;
  /** Guest (burner) wallets are offered on studionet only — it's free. */
  burnerAvailable: boolean;
  /** Privy is only offered when VITE_PRIVY_APP_ID is set. */
  privyAvailable: boolean;
  /** Privy is still restoring a prior session — connect UI should wait. */
  privyLoading: boolean;
  /** For Privy sessions: the email / handle / wallet the user signed in with. */
  accountLabel: string | null;
  /** True when the address is a Privy-managed embedded wallet. */
  embedded: boolean;
  connectPrivy: () => Promise<void>;
  connectMetaMask: () => Promise<void>;
  connectBurner: () => void;
  disconnect: () => void;
}

const WalletContext = createContext<WalletState | null>(null);

const STORAGE = "hypebond.wallet";

function savedKind(): WalletKind | null {
  const saved = localStorage.getItem(STORAGE);
  return saved === "privy" || saved === "metamask" || saved === "burner"
    ? saved
    : null;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const privy = usePrivyBridge();
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [kind, setKind] = useState<WalletKind>("metamask");
  const [connecting, setConnecting] = useState(false);
  // Providers inject asynchronously, so this starts optimistic and settles.
  const [metaMaskAvailable, setMetaMaskAvailable] = useState(hasMetaMask());

  /**
   * Which wallet the user last chose. Privy restores its session on every page
   * load whether or not this app is using it, so without an explicit
   * preference a stale Privy login would hijack a MetaMask or guest session.
   */
  const preferred = useRef<WalletKind | null>(savedKind());

  /** True from the moment the user asks for Privy until the flow settles. */
  const connectingPrivy = useRef(false);

  useEffect(() => {
    let alive = true;
    detectMetaMask().then((found) => alive && setMetaMaskAvailable(found));
    return () => {
      alive = false;
    };
  }, []);

  // A returning Privy user needs the SDK before anything can be restored;
  // everyone else pays for it only when they reach for a wallet.
  const [restoreExpired, setRestoreExpired] = useState(false);
  useEffect(() => {
    if (savedKind() !== "privy") return;
    requestPrivyMount();
    // If the chunk never arrives — offline, stale deploy — give up waiting so
    // the user is offered a wallet again instead of a spinner that never ends.
    const timer = setTimeout(() => setRestoreExpired(true), 20_000);
    return () => clearTimeout(timer);
  }, []);

  // Restore a previous session. Waits for provider injection so a MetaMask
  // session isn't silently dropped on a slow-injecting page load.
  useEffect(() => {
    const saved = savedKind();
    if (saved === "burner" && NETWORK === "studionet") {
      const account = createAccount(burnerPrivateKey());
      setKind("burner");
      setAddress(account.address as `0x${string}`);
      return;
    }
    if (saved !== "metamask") return;
    let alive = true;
    detectMetaMask().then((found) => {
      if (!alive || !found) return;
      getEthereum()
        ?.request({ method: "eth_accounts" })
        .then((accounts) => {
          if (!alive) return;
          const list = accounts as string[];
          if (list?.[0]) {
            setKind("metamask");
            setAddress(list[0] as `0x${string}`);
          } else {
            // Authorization was revoked in the wallet — don't keep claiming
            // a metamask session that will never restore.
            preferred.current = null;
            localStorage.removeItem(STORAGE);
          }
        })
        .catch(() => undefined);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Track MetaMask account switches and disconnects.
  useEffect(() => {
    if (kind !== "metamask") return;
    const eth = getEthereum();
    if (!eth?.on) return;
    const onAccounts = (...args: unknown[]) => {
      const list = args[0] as string[];
      if (list?.[0]) {
        setAddress(list[0] as `0x${string}`);
      } else {
        // Empty list = disconnected in the wallet. Clear the saved session
        // too, otherwise a refresh looks connected and every write throws.
        setAddress(null);
        preferred.current = null;
        localStorage.removeItem(STORAGE);
      }
    };
    eth.on("accountsChanged", onAccounts);
    return () => eth.removeListener?.("accountsChanged", onAccounts);
  }, [kind]);

  // ------------------------------------------------------------- privy sync
  //
  // Privy owns the session (it survives reloads on its own), so this mirrors
  // it into wallet state rather than storing the address ourselves. It only
  // acts when Privy is the preferred wallet — see `preferred` above.
  const isPrivySession = kind === "privy" && address !== null;
  useEffect(() => {
    if (!privy.available || !privy.ready) return;
    if (preferred.current !== "privy") return;
    if (privy.authenticated && privy.address) {
      setKind("privy");
      setAddress(privy.address);
      localStorage.setItem(STORAGE, "privy");
      return;
    }
    // Everything below treats "no session" as a session that ENDED, so it must
    // not run while one is still being established. Loading the SDK on demand
    // means a click walks through unmounted → ready-but-signed-out on its way
    // to signed-in: without this guard that middle state clears the very
    // preference the login is about to need, and the address never lands.
    if (connectingPrivy.current) return;
    // Authenticated with no wallet yet (Privy is still minting the embedded
    // one) is a transient state — only a real logout clears the session.
    if (privy.authenticated) return;
    if (isPrivySession) {
      setAddress(null);
      setKind("metamask");
    }
    preferred.current = null;
    localStorage.removeItem(STORAGE);
  }, [
    privy.available,
    privy.ready,
    privy.authenticated,
    privy.address,
    isPrivySession,
  ]);

  /**
   * Hand the signer to the chain client. Privy returns a new provider after a
   * network switch, so `chainId` is a dependency: without it the cached client
   * would keep signing through a provider pinned to the old chain.
   */
  useEffect(() => {
    if (kind !== "privy" || !address) {
      setExternalWallet(null);
      return;
    }
    let alive = true;
    privy.connectExternalWallet().then((wallet) => {
      if (alive) setExternalWallet(wallet);
    });
    // Deliberately no clear-on-cleanup: this effect re-runs on any identity
    // change of `connectExternalWallet`, and dropping the signer mid-flight
    // would fail a transaction the user is already signing.
    return () => {
      alive = false;
    };
  }, [kind, address, privy.chainId, privy.connectExternalWallet]);

  const connectPrivy = useCallback(async () => {
    setConnecting(true);
    connectingPrivy.current = true;
    preferred.current = "privy";
    try {
      // Loads the SDK on first use, opens the modal, and waits for the wallet
      // to exist — resolving at "logged in, no address yet" would flash the
      // connect button back at a user who just finished signing in.
      await loginWithPrivy();
    } catch (err) {
      preferred.current = savedKind();
      throw err;
    } finally {
      connectingPrivy.current = false;
      setConnecting(false);
    }
  }, []);

  const connectMetaMask = useCallback(async () => {
    setConnecting(true);
    try {
      const addr = await requestMetaMaskAccount();
      preferred.current = "metamask";
      setKind("metamask");
      setAddress(addr);
      localStorage.setItem(STORAGE, "metamask");
    } finally {
      setConnecting(false);
    }
  }, []);

  const connectBurner = useCallback(() => {
    const account = createAccount(burnerPrivateKey());
    preferred.current = "burner";
    setKind("burner");
    setAddress(account.address as `0x${string}`);
    localStorage.setItem(STORAGE, "burner");
  }, []);

  const disconnect = useCallback(() => {
    // Clear the preference first: Privy's logout lands asynchronously, and the
    // sync effect must not re-adopt the session on the way out.
    const wasPrivy = kind === "privy";
    preferred.current = null;
    setAddress(null);
    setKind("metamask");
    setExternalWallet(null);
    localStorage.removeItem(STORAGE);
    if (wasPrivy) void logoutFromPrivy();
  }, [kind]);

  // A returning Privy user is neither connected nor disconnected until the SDK
  // has loaded and restored — showing them "Connect" in that window invites a
  // pointless second login.
  const restoringPrivy =
    preferred.current === "privy" &&
    address === null &&
    !privy.ready &&
    !restoreExpired;

  const value = useMemo<WalletState>(
    () => ({
      address,
      kind,
      connecting,
      metaMaskAvailable,
      burnerAvailable: NETWORK === "studionet",
      privyAvailable: PRIVY_CONFIGURED,
      privyLoading: restoringPrivy,
      accountLabel: kind === "privy" ? privy.label : null,
      embedded: kind === "privy" && privy.embedded,
      connectPrivy,
      connectMetaMask,
      connectBurner,
      disconnect,
    }),
    [
      address,
      kind,
      connecting,
      metaMaskAvailable,
      restoringPrivy,
      privy.label,
      privy.embedded,
      connectPrivy,
      connectMetaMask,
      connectBurner,
      disconnect,
    ]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet outside WalletProvider");
  return ctx;
}
