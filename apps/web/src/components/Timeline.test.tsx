import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DEAL_STATUSES, type Deal, type DealStatus } from "@hypebond/shared";
import { Timeline, timelineNodes } from "./Timeline";

const BASE: Deal = {
  id: 1,
  brand: "0x" + "b1".repeat(20),
  influencer: "0x" + "11".repeat(20),
  amount: 10n ** 18n,
  terms: "POST REQUIREMENTS:\n- Must mention @brand",
  post_url: "",
  platform: "x",
  min_live_days: 3,
  created_at: 1_700_000_000,
  submitted_at: 0,
  verify_after: 0,
  grace_until: 0,
  last_check_at: 0,
  status: "FUNDED",
  verdict_reason: "",
  checks_passed: "",
  settled: false,
};

/** A deal that has reached `status`, with the timestamps that implies. */
function dealAt(status: DealStatus): Deal {
  const submitted = !["FUNDED", "CANCELLED"].includes(status);
  return {
    ...BASE,
    status,
    submitted_at: submitted ? BASE.created_at + 3600 : 0,
    verify_after: submitted ? BASE.created_at + 3600 + 3 * 86400 : 0,
    grace_until: status === "GRACE_PERIOD" ? BASE.created_at + 3600 + 48 * 3600 : 0,
    settled: ["PAID", "VERIFIED_FAIL", "REFUNDED", "CANCELLED"].includes(status),
  };
}

describe("timelineNodes", () => {
  it("produces the same six nodes for every status", () => {
    for (const status of DEAL_STATUSES) {
      const nodes = timelineNodes(dealAt(status));
      expect(nodes, status).toHaveLength(6);
      expect(nodes.every((n) => n.label && n.detail), status).toBe(true);
    }
  });

  it("always shows funding as complete", () => {
    for (const status of DEAL_STATUSES) {
      expect(timelineNodes(dealAt(status))[0].state, status).toBe("done");
    }
  });

  it("marks at most one node as current", () => {
    for (const status of DEAL_STATUSES) {
      const current = timelineNodes(dealAt(status)).filter(
        (n) => n.state === "current"
      );
      expect(current.length, `${status} had ${current.length} current nodes`)
        .toBeLessThanOrEqual(1);
    }
  });

  it("leaves no node current once the deal is settled", () => {
    for (const status of ["PAID", "VERIFIED_FAIL", "REFUNDED", "CANCELLED"] as const) {
      const nodes = timelineNodes(dealAt(status));
      expect(nodes.some((n) => n.state === "current"), status).toBe(false);
    }
  });

  it("points at the influencer while the deal is funded", () => {
    const nodes = timelineNodes(dealAt("FUNDED"));
    expect(nodes[1].state).toBe("current");
    expect(nodes[1].detail).toMatch(/waiting on influencer/i);
  });

  it("points at the validators while the initial check runs", () => {
    const nodes = timelineNodes(dealAt("SUBMITTED"));
    expect(nodes[1].state).toBe("done");
    expect(nodes[2].state).toBe("current");
  });

  it("flags the failed initial check during the grace period", () => {
    const nodes = timelineNodes(dealAt("GRACE_PERIOD"));
    expect(nodes[2].state).toBe("fail");
    expect(nodes[2].detail).toMatch(/grace period/i);
  });

  it("runs the live-window node while verifying", () => {
    const nodes = timelineNodes(dealAt("VERIFYING"));
    expect(nodes[2].state).toBe("done");
    expect(nodes[3].state).toBe("current");
  });

  it("completes every node on the paid path", () => {
    const nodes = timelineNodes(dealAt("PAID"));
    expect(nodes.every((n) => n.state === "done")).toBe(true);
    expect(nodes[5].label).toBe("Paid");
    expect(nodes[5].detail).toMatch(/released to influencer/i);
  });

  it("renames the payout node on every refund path", () => {
    for (const status of ["VERIFIED_FAIL", "REFUNDED", "CANCELLED"] as const) {
      const nodes = timelineNodes(dealAt(status));
      expect(nodes[5].label, status).toBe("Refunded");
      expect(nodes[5].state, status).toBe("fail");
    }
  });

  it("distinguishes a brand cancellation from a timeout reclaim", () => {
    expect(timelineNodes(dealAt("CANCELLED"))[5].detail).toMatch(/cancelled by brand/i);
    expect(timelineNodes(dealAt("REFUNDED"))[5].detail).toMatch(/reclaimed by brand/i);
  });

  it("shows the configured window before a post lands and the real one after", () => {
    expect(timelineNodes(dealAt("FUNDED"))[3].detail).toMatch(/3 days minimum/);
    expect(timelineNodes(dealAt("VERIFYING"))[3].detail).toMatch(/^until /);
  });

  it("singularizes a one-day live window", () => {
    const deal = { ...dealAt("FUNDED"), min_live_days: 1 };
    expect(timelineNodes(deal)[3].detail).toMatch(/1 day minimum/);
  });
});

describe("<Timeline />", () => {
  it("renders every node label", () => {
    render(<Timeline deal={dealAt("VERIFYING")} />);
    for (const label of [
      "Funded",
      "Post submitted",
      "Initial check",
      "Live window",
      "Final verification",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("renders as an ordered list for assistive tech", () => {
    const { container } = render(<Timeline deal={dealAt("PAID")} />);
    expect(container.querySelector("ol")).toBeTruthy();
    expect(container.querySelectorAll("li")).toHaveLength(6);
  });
});
