import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import App from "./App";

/** Let the boot loader, the route transition and the stagger all finish. */
const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 1500));
  });

/**
 * Every element inside <main> still holding a sub-1 inline opacity.
 *
 * A page that entered correctly ends at opacity 1. This regression guards a
 * bug where `AnimatePresence mode="wait"` mounted the incoming route but never
 * ran its enter animation, so the whole page sat at its `initial` variant —
 * present in the DOM, invisible on screen, and only cleared by a reload.
 * Nothing else in the suite notices, because queries match invisible elements
 * just as happily as visible ones.
 */
function transparentNodes(main: HTMLElement) {
  return [...main.querySelectorAll<HTMLElement>("[style*='opacity']")].filter(
    (el) => el.style.opacity !== "" && Number(el.style.opacity) < 1
  );
}

describe("route transitions", () => {
  for (const { label, path } of [
    { label: "New bond", path: "/new" },
    { label: "Dashboard", path: "/dashboard" },
    { label: "Docs", path: "/docs" },
  ]) {
    it(
      `renders ${label} visibly after client-side navigation`,
      async () => {
        const user = userEvent.setup();
        const { container } = render(
          <MemoryRouter initialEntries={["/"]}>
            <App />
          </MemoryRouter>
        );
        await settle();

        await user.click(screen.getAllByRole("link", { name: label })[0]);
        await settle();

        // The rail NavLink marks the route we actually landed on.
        expect(
          container.querySelector(`a[aria-current="page"][href="${path}"]`)
        ).not.toBeNull();

        const main = container.querySelector("main") as HTMLElement;
        expect(main.textContent?.trim()).not.toBe("");
        expect(
          transparentNodes(main).map((el) => el.outerHTML.slice(0, 140))
        ).toEqual([]);
      },
      20_000
    );
  }
});
