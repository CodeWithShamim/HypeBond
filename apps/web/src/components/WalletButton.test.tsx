import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "@/lib/toast";
import { WalletButton } from "./WalletButton";

const ADDRESS = `0x${"ab".repeat(20)}` as `0x${string}`;

const { wallet } = vi.hoisted(() => ({
  wallet: {
    state: {
      address: null as `0x${string}` | null,
      kind: "metamask" as "privy" | "metamask" | "burner",
      connecting: false,
      metaMaskAvailable: true,
      burnerAvailable: true,
      privyAvailable: true,
      privyLoading: false,
      accountLabel: null as string | null,
      embedded: false,
      connectPrivy: vi.fn(async () => undefined),
      connectMetaMask: vi.fn(async () => undefined),
      connectBurner: vi.fn(),
      disconnect: vi.fn(),
    },
  },
}));

vi.mock("@/lib/wallet", () => ({ useWallet: () => wallet.state }));

function renderButton() {
  return render(
    <ToastProvider>
      <WalletButton />
    </ToastProvider>
  );
}

const open = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: /connect/i }));

beforeEach(() => {
  Object.assign(wallet.state, {
    address: null,
    kind: "metamask",
    metaMaskAvailable: true,
    burnerAvailable: true,
    privyAvailable: true,
    privyLoading: false,
    accountLabel: null,
    embedded: false,
  });
});

describe("<WalletButton /> connect menu", () => {
  it("offers email/social alongside MetaMask and the guest wallet", async () => {
    const user = userEvent.setup();
    renderButton();
    await open(user);

    expect(screen.getByText("Email or social")).toBeInTheDocument();
    expect(screen.getByText("MetaMask")).toBeInTheDocument();
    expect(screen.getByText("Guest wallet")).toBeInTheDocument();
  });

  it("hides email/social when no Privy app id is configured", async () => {
    const user = userEvent.setup();
    wallet.state.privyAvailable = false;
    renderButton();
    await open(user);

    expect(screen.queryByText("Email or social")).not.toBeInTheDocument();
    expect(screen.getByText("MetaMask")).toBeInTheDocument();
  });

  it("starts the Privy login flow", async () => {
    const user = userEvent.setup();
    renderButton();
    await open(user);
    await user.click(screen.getByText("Email or social"));

    expect(wallet.state.connectPrivy).toHaveBeenCalled();
  });

  /**
   * A creator who lands here without an extension still has a wallet route —
   * disabling MetaMask must not disable the menu.
   */
  it("keeps email/social usable when MetaMask is missing", async () => {
    const user = userEvent.setup();
    wallet.state.metaMaskAvailable = false;
    renderButton();
    await open(user);

    expect(screen.getByRole("menuitem", { name: /MetaMask/ })).toBeDisabled();
    expect(
      screen.getByRole("menuitem", { name: /Email or social/ })
    ).toBeEnabled();
  });

  it("reports a failed connect instead of silently doing nothing", async () => {
    const user = userEvent.setup();
    wallet.state.connectPrivy = vi.fn(async () => {
      throw new Error("popup blocked");
    });
    renderButton();
    await open(user);
    await user.click(screen.getByText("Email or social"));

    await waitFor(() =>
      expect(screen.getByText("popup blocked")).toBeInTheDocument()
    );
  });
});

describe("<WalletButton /> account menu", () => {
  beforeEach(() => {
    Object.assign(wallet.state, {
      address: ADDRESS,
      kind: "privy",
      embedded: true,
      accountLabel: "creator@example.com",
    });
  });

  it("shows how the user signed in, not just the address", async () => {
    const user = userEvent.setup();
    renderButton();
    await user.click(screen.getByRole("button", { name: /0xabab/i }));

    expect(screen.getByText("Embedded wallet")).toBeInTheDocument();
    expect(screen.getByText("creator@example.com")).toBeInTheDocument();
    expect(screen.getByText(ADDRESS)).toBeInTheDocument();
  });

  /**
   * The chip used to disconnect on click. With an embedded wallet behind it
   * that is destructive-by-accident, so disconnect now lives in the menu.
   */
  it("does not disconnect on a stray click of the chip", async () => {
    const user = userEvent.setup();
    renderButton();
    await user.click(screen.getByRole("button", { name: /0xabab/i }));

    expect(wallet.state.disconnect).not.toHaveBeenCalled();

    await user.click(screen.getByRole("menuitem", { name: /Disconnect/ }));
    expect(wallet.state.disconnect).toHaveBeenCalled();
  });
});
