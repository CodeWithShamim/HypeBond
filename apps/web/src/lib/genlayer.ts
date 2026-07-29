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

let client: GenLayerClient<GenLayerChain> | null = null;
let clientKey = "";

/**
 * Client bound to the connected account. MetaMask accounts are passed as a
 * plain address — genlayer-js signs through window.ethereum. Burner accounts
 * sign locally.
 */
export function genlayerClient(
  kind: WalletKind,
  address: `0x${string}` | null
): GenLayerClient<GenLayerChain> {
  const key = `${NETWORK}:${kind}:${address ?? "read-only"}`;
  if (client && clientKey === key) return client;
  client = createClient({
    chain: CHAIN,
    ...(kind === "metamask" && address
      ? { account: address }
      : { account: createAccount(burnerPrivateKey()) }),
  });
  clientKey = key;
  return client;
}

/** Read-only client (no wallet needed). */
export function readClient(): GenLayerClient<GenLayerChain> {
  return genlayerClient("burner", null);
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
