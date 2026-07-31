import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  DEAL_STATUSES,
  GRACE_HOURS,
  PLATFORMS,
  PLATFORM_DOMAINS,
  RECHECK_COOLDOWN_SECONDS,
  STALE_WINDOW_DAYS,
  SUBMIT_WINDOW_DAYS,
} from "@hypebond/shared";
import { Docs } from "./Docs";

const renderDocs = () =>
  render(
    <MemoryRouter>
      <Docs />
    </MemoryRouter>
  );

describe("<Docs />", () => {
  it("every in-page anchor resolves to a section that exists", () => {
    const { container } = renderDocs();
    const anchors = [...container.querySelectorAll('a[href^="#"]')];
    expect(anchors.length).toBeGreaterThan(0);
    for (const a of anchors) {
      const id = a.getAttribute("href")!.slice(1);
      expect(container.querySelector(`section#${id}`)).not.toBeNull();
    }
  });

  it("documents every deal status", () => {
    const { container } = renderDocs();
    // The status table is the first of the two in that section.
    const statusTable = container.querySelector("#lifecycle table");
    expect(statusTable?.querySelectorAll("tbody tr")).toHaveLength(
      DEAL_STATUSES.length
    );
  });

  it("documents every platform with its accepted hosts", () => {
    renderDocs();
    for (const p of PLATFORMS) {
      for (const domain of PLATFORM_DOMAINS[p]) {
        expect(
          screen.getAllByText(new RegExp(domain)).length
        ).toBeGreaterThan(0);
      }
    }
  });

  it("quotes the window lengths the contract actually enforces", () => {
    renderDocs();
    // These are imported from shared, not retyped — the assertion is that
    // they reach the page at all, so a constant change surfaces here rather
    // than leaving the docs quietly wrong.
    expect(
      screen.getAllByText(new RegExp(`${SUBMIT_WINDOW_DAYS} days`)).length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(new RegExp(`${GRACE_HOURS} hours`)).length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(new RegExp(`${STALE_WINDOW_DAYS} days`)).length
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(new RegExp(`${RECHECK_COOLDOWN_SECONDS} seconds`))
        .length
    ).toBeGreaterThan(0);
  });

  it("keeps the contract API reference in sync with the write methods", () => {
    renderDocs();
    for (const method of [
      "create_deal",
      "submit_post",
      "recheck_post",
      "finalize",
      "cancel_deal",
      "claim_timeout",
    ]) {
      expect(screen.getAllByText(new RegExp(method)).length).toBeGreaterThan(0);
    }
  });

  it("renders one heading per navigation entry", () => {
    renderDocs();
    for (const title of [
      "Overview",
      "Architecture",
      "Deal lifecycle",
      "Verification",
      "Contract API",
      "Security model",
      "Frontend",
      "Setup",
      "Testing",
      "Reference",
    ]) {
      expect(
        screen.getByRole("heading", { name: title, level: 2 })
      ).toBeInTheDocument();
    }
  });
});
