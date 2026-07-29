import { createAccount, createClient, generatePrivateKey } from "genlayer-js";
import { studionet, testnetAsimov } from "genlayer-js/chains";
import type { GenLayerChain, GenLayerClient } from "genlayer-js/types";

export const CONTRACT_ADDRESS = (import.meta.env.VITE_HYPEBOND_ADDRESS ??
  "") as `0x${string}`;

export const CONTRACT_CONFIGURED = /^0x[0-9a-fA-F]{40}$/.test(CONTRACT_ADDRESS);

export type NetworkName = "studionet" | "testnet-asimov";

export const NETWORK: NetworkName =
  import.meta.env.VITE_GENLAYER_NETWORK === "testnet-asimov"
    ? "testnet-asimov"
    : "studionet";

export const CHAIN: GenLayerChain =
  NETWORK === "testnet-asimov" ? testnetAsimov : studionet;

/** On studionet there is no gas token, so a throwaway local key is a fine
 * fallback when MetaMask isn't installed ("guest mode"). */
const BURNER_KEY = "hypebond.burnerKey";

export function burnerPrivateKey(): `0x${string}` {
  const existing = localStorage.getItem(BURNER_KEY);
  if (existing && /^0x[0-9a-fA-F]{64}$/.test(existing))
    return existing as `0x${string}`;
  const key = generatePrivateKey();
  localStorage.setItem(BURNER_KEY, key);
  return key;
}

export type WalletKind = "metamask" | "burner";

/**
 * Keyed cache. A single slot would thrash: every read went through the
 * burner key and evicted the MetaMask-bound client (and vice versa), so an
 * alternating read/write sequence rebuilt a client on every call.
 */
const clients = new Map<string, GenLayerClient<GenLayerChain>>();

function cached(
  key: string,
  make: () => GenLayerClient<GenLayerChain>
): GenLayerClient<GenLayerChain> {
  const hit = clients.get(key);
  if (hit) return hit;
  const made = make();
  clients.set(key, made);
  return made;
}

/**
 * Client bound to the connected account. MetaMask accounts are passed as a
 * plain address — genlayer-js signs through window.ethereum. Burner accounts
 * sign locally.
 */
export function genlayerClient(
  kind: WalletKind,
  address: `0x${string}` | null
): GenLayerClient<GenLayerChain> {
  if (kind === "metamask" && address) {
    return cached(`${NETWORK}:metamask:${address}`, () =>
      createClient({ chain: CHAIN, account: address })
    );
  }
  return cached(`${NETWORK}:burner`, () =>
    createClient({ chain: CHAIN, account: createAccount(burnerPrivateKey()) })
  );
}

/**
 * Read-only client. Deliberately account-less: reads need no signer, and
 * routing them through the burner minted + persisted a private key in
 * localStorage for visitors who never asked for a wallet.
 */
export function readClient(): GenLayerClient<GenLayerChain> {
  return cached(`${NETWORK}:read-only`, () => createClient({ chain: CHAIN }));
}

let consensusReady: Promise<void> | null = null;

/** Asimov requires initializing the consensus contract before writes. */
export async function ensureConsensus(
  c: GenLayerClient<GenLayerChain>
): Promise<void> {
  if (!consensusReady) {
    consensusReady = c
      .initializeConsensusSmartContract()
      .catch(() => undefined) as Promise<void>;
  }
  await consensusReady;
}

interface EthereumProvider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, cb: (...args: unknown[]) => void): void;
  removeListener?(event: string, cb: (...args: unknown[]) => void): void;
}

export function getEthereum(): EthereumProvider | null {
  const eth = (window as unknown as { ethereum?: EthereumProvider }).ethereum;
  return eth ?? null;
}

export function hasMetaMask(): boolean {
  return getEthereum() !== null;
}

/**
 * Wallet extensions inject `window.ethereum` asynchronously, so a single
 * check at first render reports "not installed" for users who do have it.
 * Resolves as soon as the provider appears, or false after a short grace.
 */
export function detectMetaMask(timeoutMs = 3000): Promise<boolean> {
  if (hasMetaMask()) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const done = (found: boolean) => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      clearTimeout(timer);
      window.removeEventListener("ethereum#initialized", onInit);
      resolve(found);
    };
    const onInit = () => done(true);
    window.addEventListener("ethereum#initialized", onInit, { once: true });
    const poll = setInterval(() => hasMetaMask() && done(true), 200);
    const timer = setTimeout(() => done(hasMetaMask()), timeoutMs);
  });
}

/**
 * Assert the wallet is on the GenLayer chain, switching if not.
 *
 * Connect-time is not enough: the user can switch networks in MetaMask at any
 * point afterwards, and a write sent on the wrong chain either fails opaquely
 * or lands somewhere it shouldn't.
 */
export async function ensureCorrectChain(): Promise<void> {
  const eth = getEthereum();
  if (!eth) return;
  const wanted = `0x${CHAIN.id.toString(16)}`;
  let current: string | null = null;
  try {
    current = (await eth.request({ method: "eth_chainId" })) as string;
  } catch {
    current = null;
  }
  if (current?.toLowerCase() === wanted.toLowerCase()) return;
  await addGenLayerNetwork();
}

/** Prompt MetaMask to add + switch to the GenLayer network. */
export async function addGenLayerNetwork(): Promise<void> {
  const eth = getEthereum();
  if (!eth) return;
  const chainIdHex = `0x${CHAIN.id.toString(16)}`;
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }],
    });
  } catch {
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: chainIdHex,
          chainName: CHAIN.name,
          nativeCurrency: CHAIN.nativeCurrency,
          rpcUrls: CHAIN.rpcUrls.default.http,
          blockExplorerUrls: CHAIN.blockExplorers
            ? [CHAIN.blockExplorers.default.url]
            : [],
        },
      ],
    });
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }],
    });
  }
}

export async function requestMetaMaskAccount(): Promise<`0x${string}`> {
  const eth = getEthereum();
  if (!eth) throw new Error("MetaMask is not installed");
  const accounts = (await eth.request({
    method: "eth_requestAccounts",
  })) as string[];
  if (!accounts?.[0]) throw new Error("No account authorized");
  await addGenLayerNetwork();
  return accounts[0] as `0x${string}`;
}

export function explorerAddressUrl(address: string): string {
  const base =
    NETWORK === "studionet"
      ? "https://explorer-studio.genlayer.com"
      : CHAIN.blockExplorers?.default.url ?? "https://explorer-asimov.genlayer.com";
  return `${base.replace(/\/$/, "")}/address/${address}`;
}
