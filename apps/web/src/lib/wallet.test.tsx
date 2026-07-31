import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const BURNER = `0x${"bb".repeat(20)}` as const;
const PRIVY_ADDR = `0x${"aa".repeat(20)}` as const;
const META_ADDR = `0x${"cc".repeat(20)}` as const;

const { privy, setExternalWallet } = vi.hoisted(() => {
  const externalWallet = { provider: { request: async () => null }, switchChain: async () => {} };
  return {
    setExternalWallet: vi.fn(),
    privy: {
      state: {
        available: true,
        ready: true,
        authenticated: false,
        address: null as string | null,
        chainId: "eip155:61999",
        label: null as string | null,
        embedded: false,
        login: vi.fn(),
        logout: vi.fn(async () => undefined),
        connectExternalWallet: vi.fn(async () => externalWallet),
      },
    },
  };
});

vi.mock("./privy", () => ({ usePrivyBridge: () => privy.state }));

vi.mock("./genlayer", () => ({
  NETWORK: "studionet",
  burnerPrivateKey: () => `0x${"11".repeat(32)}`,
  detectMetaMask: async () => true,
  hasMetaMask: () => true,
  getEthereum: () => ({ request: async () => [], on: () => {}, removeListener: () => {} }),
  requestMetaMaskAccount: async () => META_ADDR,
  setExternalWallet,
}));

vi.mock("genlayer-js", () => ({ createAccount: () => ({ address: BURNER }) }));

import { WalletProvider, useWallet } from "./wallet";

function Probe() {
  const w = useWallet();
  return (
    <div>
      <span data-testid="addr">{w.address ?? "none"}</span>
      <span data-testid="kind">{w.kind}</span>
      <span data-testid="label">{w.accountLabel ?? "none"}</span>
      <button onClick={() => void w.connectPrivy()}>connect privy</button>
      <button onClick={() => w.connectBurner()}>connect burner</button>
      <button onClick={w.disconnect}>disconnect</button>
    </div>
  );
}

function renderWallet() {
  return render(
    <WalletProvider>
      <Probe />
    </WalletProvider>
  );
}

/** Put Privy in a logged-in state, as its hooks would report after login. */
function authenticate(address = PRIVY_ADDR, label = "creator@example.com") {
  privy.state.authenticated = true;
  privy.state.address = address;
  privy.state.label = label;
}

beforeEach(() => {
  localStorage.clear();
  Object.assign(privy.state, {
    available: true,
    ready: true,
    authenticated: false,
    address: null,
    label: null,
    embedded: false,
  });
});

/**
 * Privy restores its own session on every page load, whether or not this app
 * was using it. The saved preference is the only thing keeping that restored
 * session from hijacking a MetaMask or guest wallet the user actually picked,
 * so the adoption rules are pinned here.
 */
describe("privy session adoption", () => {
  it("adopts a restored Privy session when Privy is the saved wallet", async () => {
    localStorage.setItem("hypebond.wallet", "privy");
    authenticate();
    renderWallet();

    await waitFor(() =>
      expect(screen.getByTestId("addr")).toHaveTextContent(PRIVY_ADDR)
    );
    expect(screen.getByTestId("kind")).toHaveTextContent("privy");
    expect(screen.getByTestId("label")).toHaveTextContent("creator@example.com");
  });

  it("ignores an authenticated Privy session when the guest wallet was saved", async () => {
    localStorage.setItem("hypebond.wallet", "burner");
    authenticate();
    renderWallet();

    await waitFor(() =>
      expect(screen.getByTestId("addr")).toHaveTextContent(BURNER)
    );
    expect(screen.getByTestId("kind")).toHaveTextContent("burner");
    expect(localStorage.getItem("hypebond.wallet")).toBe("burner");
  });

  it("clears a saved Privy session that no longer authenticates", async () => {
    localStorage.setItem("hypebond.wallet", "privy");
    renderWallet();

    await waitFor(() =>
      expect(localStorage.getItem("hypebond.wallet")).toBeNull()
    );
    expect(screen.getByTestId("addr")).toHaveTextContent("none");
  });

  it("waits for the embedded wallet instead of dropping a fresh login", async () => {
    localStorage.setItem("hypebond.wallet", "privy");
    // Authenticated, but Privy is still minting the embedded wallet.
    privy.state.authenticated = true;
    renderWallet();

    await waitFor(() => expect(screen.getByTestId("addr")).toHaveTextContent("none"));
    expect(localStorage.getItem("hypebond.wallet")).toBe("privy");
  });

  it("connects through the Privy modal and remembers the choice", async () => {
    const user = userEvent.setup();
    privy.state.login = vi.fn(async () => {
      authenticate();
    });
    renderWallet();

    await user.click(screen.getByText("connect privy"));

    await waitFor(() =>
      expect(screen.getByTestId("addr")).toHaveTextContent(PRIVY_ADDR)
    );
    expect(localStorage.getItem("hypebond.wallet")).toBe("privy");
  });
});

describe("privy signer registration", () => {
  it("hands the Privy provider to the chain client", async () => {
    localStorage.setItem("hypebond.wallet", "privy");
    authenticate();
    renderWallet();

    await waitFor(() =>
      expect(privy.state.connectExternalWallet).toHaveBeenCalled()
    );
    await waitFor(() =>
      expect(setExternalWallet).toHaveBeenCalledWith(
        expect.objectContaining({ switchChain: expect.any(Function) })
      )
    );
  });

  it("drops the signer and logs out of Privy on disconnect", async () => {
    const user = userEvent.setup();
    localStorage.setItem("hypebond.wallet", "privy");
    authenticate();
    renderWallet();
    await waitFor(() =>
      expect(screen.getByTestId("addr")).toHaveTextContent(PRIVY_ADDR)
    );

    await user.click(screen.getByText("disconnect"));

    expect(privy.state.logout).toHaveBeenCalled();
    expect(setExternalWallet).toHaveBeenLastCalledWith(null);
    expect(screen.getByTestId("addr")).toHaveTextContent("none");
    expect(localStorage.getItem("hypebond.wallet")).toBeNull();
  });

  it("leaves Privy alone when disconnecting a non-Privy wallet", async () => {
    const user = userEvent.setup();
    renderWallet();

    await user.click(screen.getByText("connect burner"));
    await user.click(screen.getByText("disconnect"));

    expect(privy.state.logout).not.toHaveBeenCalled();
    expect(screen.getByTestId("addr")).toHaveTextContent("none");
  });
});
