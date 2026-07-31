import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { ADDRESS, configured } = vi.hoisted(() => ({
  ADDRESS: `0x${"11".repeat(20)}`,
  configured: { value: true },
}));

vi.mock("@/lib/genlayer", () => ({
  CONTRACT_ADDRESS: ADDRESS,
  get CONTRACT_CONFIGURED() {
    return configured.value;
  },
  explorerAddressUrl: (a: string) => `https://explorer.example/address/${a}`,
}));

import { ExplorerLink } from "./ExplorerLink";

describe("<ExplorerLink />", () => {
  it("links anyone to the contract's explorer page in a new tab", () => {
    render(<ExplorerLink />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute(
      "href",
      `https://explorer.example/address/${ADDRESS}`
    );
    expect(link).toHaveAttribute("target", "_blank");
    // no-referrer opener guard: the explorer is a third-party origin
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("shows the short contract address in the full variant", () => {
    render(<ExplorerLink />);
    expect(screen.getByText("0x1111…1111")).toBeInTheDocument();
  });

  it("renders nothing when no contract address is configured", () => {
    configured.value = false;
    const { container } = render(<ExplorerLink />);
    expect(container).toBeEmptyDOMElement();
    configured.value = true;
  });
});
