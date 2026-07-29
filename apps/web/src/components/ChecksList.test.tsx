import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChecksList } from "./ChecksList";

const verdict = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    exists: true,
    checks: [
      { requirement: "Mentions @brand", passed: true, evidence: "shoutout @brand" },
      { requirement: "Includes #ad", passed: false, evidence: "no such mention found" },
    ],
    overall_pass: false,
    reason: "Missing the required hashtag.",
    ...over,
  });

describe("<ChecksList />", () => {
  it("renders one row per criterion plus the liveness row", () => {
    const { container } = render(<ChecksList checksJson={verdict()} />);
    expect(container.querySelectorAll("li")).toHaveLength(3);
    expect(screen.getByText("Post is live and publicly readable")).toBeInTheDocument();
    expect(screen.getByText("Mentions @brand")).toBeInTheDocument();
    expect(screen.getByText("Includes #ad")).toBeInTheDocument();
  });

  it("labels pass and fail states for assistive tech", () => {
    render(<ChecksList checksJson={verdict()} />);
    expect(screen.getAllByLabelText("passed")).toHaveLength(2); // liveness + mention
    expect(screen.getAllByLabelText("failed")).toHaveLength(1);
  });

  it("marks the liveness row failed when the post does not exist", () => {
    render(
      <ChecksList checksJson={verdict({ exists: false, checks: [] })} />
    );
    expect(screen.getAllByLabelText("failed")).toHaveLength(1);
    expect(screen.queryAllByLabelText("passed")).toHaveLength(0);
  });

  it("shows the validator's evidence quote", () => {
    render(<ChecksList checksJson={verdict()} />);
    expect(screen.getByText(/shoutout @brand/)).toBeInTheDocument();
  });

  it("renders nothing rather than crashing on unusable JSON", () => {
    for (const raw of ["", "{not json", "null"]) {
      const { container } = render(<ChecksList checksJson={raw} />);
      expect(container).toBeEmptyDOMElement();
    }
  });

  it("survives a verdict whose checks are the wrong shape", () => {
    const { container } = render(
      <ChecksList checksJson={JSON.stringify({ exists: true, checks: "nope" })} />
    );
    expect(container.querySelectorAll("li")).toHaveLength(1); // liveness row only
  });

  it("does not render an empty evidence quote", () => {
    const { container } = render(
      <ChecksList
        checksJson={verdict({
          checks: [{ requirement: "Mentions @brand", passed: true, evidence: "" }],
        })}
      />
    );
    expect(container.textContent).not.toContain("“”");
  });
});
