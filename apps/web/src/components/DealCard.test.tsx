import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Deal, DealRole } from "@hypebond/shared";
import { DealCard } from "./DealCard";

const deal: Deal = {
  id: 42,
  brand: "0x" + "b1".repeat(20),
  influencer: "0x" + "11".repeat(20),
  amount: 1_500_000_000_000_000_000n, // 1.5 GEN
  terms: "POST REQUIREMENTS:\n- Must mention @brand",
  post_url: "",
  platform: "instagram",
  min_live_days: 7,
  created_at: 1_700_000_000,
  submitted_at: 0,
  first_submitted_at: 0,
  verify_after: 0,
  grace_until: 0,
  last_check_at: 0,
  cancel_requested_at: 0,
  unreachable_since: 0,
  status: "FUNDED",
  verdict_reason: "",
  checks_passed: "",
  settled: false,
};

const renderCard = (d: Deal = deal, role?: DealRole, nowSec?: number) =>
  render(
    <MemoryRouter>
      <DealCard deal={d} role={role} nowSec={nowSec} />
    </MemoryRouter>
  );

const DAY = 86400;

describe("<DealCard />", () => {
  it("shows the bond serial, escrow and platform", () => {
    renderCard();
    expect(screen.getByText("HB-000042")).toBeInTheDocument();
    expect(screen.getByText("1.5")).toBeInTheDocument();
    expect(screen.getByText("Instagram")).toBeInTheDocument();
  });

  it("links to the deal page", () => {
    renderCard();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/deal/42");
  });

  it("renders both party addresses abbreviated", () => {
    renderCard();
    expect(screen.getByText(/brand 0xb1b1…b1b1/)).toBeInTheDocument();
    expect(screen.getByText(/creator 0x1111…1111/)).toBeInTheDocument();
  });

  it("renders a status chip for every status", () => {
    for (const status of ["FUNDED", "VERIFYING", "PAID", "VERIFIED_FAIL"] as const) {
      const { unmount } = renderCard({ ...deal, status });
      expect(screen.getByRole("link").textContent).toBeTruthy();
      unmount();
    }
  });

  it("renders a zero escrow without crashing", () => {
    renderCard({ ...deal, amount: 0n });
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("shows no to-do badge when no role is given", () => {
    renderCard({ ...deal, status: "FUNDED" });
    expect(screen.queryByText(/Post, then submit/i)).not.toBeInTheDocument();
  });

  it("warns the creator when an unfinalized bond can be reclaimed", () => {
    // The badge exists for exactly this: the creator's post is live and
    // passing, a finalize already errored, and doing nothing hands the escrow
    // back to the brand. A status chip alone never shows that.
    const stuck: Deal = {
      ...deal,
      status: "VERIFYING",
      verify_after: 10 * DAY,
      last_check_at: 10 * DAY,
    };
    renderCard(stuck, "influencer", 11 * DAY);
    expect(screen.getByText(/brand can reclaim/i)).toBeInTheDocument();
  });

  it("does not warn before a finalize has actually failed", () => {
    const fresh: Deal = { ...deal, status: "VERIFYING", verify_after: 10 * DAY };
    renderCard(fresh, "influencer", 11 * DAY);
    expect(screen.queryByText(/brand can reclaim/i)).not.toBeInTheDocument();
    expect(screen.getByText(/finalize to get paid/i)).toBeInTheDocument();
  });

  it("gives the two roles different to-dos for the same bond", () => {
    const lapsed: Deal = { ...deal, status: "GRACE_PERIOD", grace_until: 2 * DAY };
    const { unmount } = renderCard(lapsed, "brand", 3 * DAY);
    expect(screen.getByText(/reclaim the escrow/i)).toBeInTheDocument();
    unmount();

    renderCard(lapsed, "influencer", 3 * DAY);
    expect(screen.queryByText(/reclaim the escrow/i)).not.toBeInTheDocument();
  });
});
