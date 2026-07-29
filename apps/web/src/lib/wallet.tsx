import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
  type WalletKind,
} from "./genlayer";

interface WalletState {
  address: `0x${string}` | null;
  kind: WalletKind;
  connecting: boolean;
  metaMaskAvailable: boolean;
  /** Guest (burner) wallets are offered on studionet only — it's free. */
  burnerAvailable: boolean;
  connectMetaMask: () => Promise<void>;
  connectBurner: () => void;
  disconnect: () => void;
}

const WalletContext = createContext<WalletState | null>(null);

const STORAGE = "hypebond.wallet";

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [kind, setKind] = useState<WalletKind>("metamask");
  const [connecting, setConnecting] = useState(false);
  // Providers inject asynchronously, so this starts optimistic and settles.
  const [metaMaskAvailable, setMetaMaskAvailable] = useState(hasMetaMask());

  useEffect(() => {
    let alive = true;
    detectMetaMask().then((found) => alive && setMetaMaskAvailable(found));
    return () => {
      alive = false;
    };
  }, []);

  // Restore a previous session. Waits for provider injection so a MetaMask
  // session isn't silently dropped on a slow-injecting page load.
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE);
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
        localStorage.removeItem(STORAGE);
      }
    };
    eth.on("accountsChanged", onAccounts);
    return () => eth.removeListener?.("accountsChanged", onAccounts);
  }, [kind]);

  const connectMetaMask = useCallback(async () => {
    setConnecting(true);
    try {
      const addr = await requestMetaMaskAccount();
      setKind("metamask");
      setAddress(addr);
      localStorage.setItem(STORAGE, "metamask");
    } finally {
      setConnecting(false);
    }
  }, []);

  const connectBurner = useCallback(() => {
    const account = createAccount(burnerPrivateKey());
    setKind("burner");
    setAddress(account.address as `0x${string}`);
    localStorage.setItem(STORAGE, "burner");
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setKind("metamask");
    localStorage.removeItem(STORAGE);
  }, []);

  const value = useMemo<WalletState>(
    () => ({
      address,
      kind,
      connecting,
      metaMaskAvailable,
      burnerAvailable: NETWORK === "studionet",
      connectMetaMask,
      connectBurner,
      disconnect,
    }),
    [
      address,
      kind,
      connecting,
      metaMaskAvailable,
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
