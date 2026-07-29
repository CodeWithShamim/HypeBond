import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ErrorBoundary } from "./ErrorBoundary";

/** Always throws on render. Typed as returning an element so TS accepts it
 * as a JSX component even though it never returns. */
function Boom({
  message = "deal payload was malformed",
}: {
  message?: string;
}): JSX.Element {
  throw new Error(message);
}

describe("<ErrorBoundary />", () => {
  beforeEach(() => {
    // React logs caught render errors; keep the test output readable.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("renders children when nothing throws", () => {
    render(
      <ErrorBoundary>
        <p>all good</p>
      </ErrorBoundary>
    );
    expect(screen.getByText("all good")).toBeInTheDocument();
  });

  it("shows a readable panel instead of a blank page when a child throws", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByText("Something broke")).toBeInTheDocument();
    expect(screen.getByText(/deal payload was malformed/)).toBeInTheDocument();
  });

  it("reassures the user that funds are unaffected", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByText(/escrow is untouched/i)).toBeInTheDocument();
  });

  it("logs the error so it is diagnosable", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    expect(console.error).toHaveBeenCalled();
  });

  it("recovers when the user retries and the underlying failure is gone", async () => {
    const user = userEvent.setup();
    // Module-scope rather than component state: resetting the boundary
    // remounts the child, so a useState flag would reset along with it.
    let broken = true;

    function Flaky() {
      if (broken) throw new Error("transient RPC error");
      return <p>recovered</p>;
    }

    render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>
    );
    expect(screen.getByText("Something broke")).toBeInTheDocument();

    broken = false;
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(screen.getByText("recovered")).toBeInTheDocument();
  });

  it("keeps showing the panel when the retry fails again", async () => {
    const user = userEvent.setup();
    render(
      <ErrorBoundary>
        <Boom message="still broken" />
      </ErrorBoundary>
    );
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(screen.getByText("Something broke")).toBeInTheDocument();
    expect(screen.getByText(/still broken/)).toBeInTheDocument();
  });

  it("uses a custom fallback when one is supplied", () => {
    render(
      <ErrorBoundary fallback={(e) => <p>custom: {e.message}</p>}>
        <Boom message="nope" />
      </ErrorBoundary>
    );
    expect(screen.getByText("custom: nope")).toBeInTheDocument();
    expect(screen.queryByText("Something broke")).not.toBeInTheDocument();
  });
});
