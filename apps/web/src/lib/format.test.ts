import { describe, expect, it } from "vitest";
import {
  countdownLabel,
  countdownTo,
  errorMessage,
  formatDate,
  formatGen,
  parseGen,
  shortAddr,
} from "./format";

const ONE = 10n ** 18n;

describe("formatGen", () => {
  it("formats whole amounts", () => {
    expect(formatGen(0n)).toBe("0");
    expect(formatGen(ONE)).toBe("1");
    expect(formatGen(500n * ONE)).toBe("500");
  });

  it("formats and trims fractional amounts", () => {
    expect(formatGen(ONE + ONE / 2n)).toBe("1.5");
    expect(formatGen(ONE / 4n)).toBe("0.25");
    expect(formatGen(ONE + ONE / 10n)).toBe("1.1");
  });

  it("truncates below the requested precision rather than rounding up", () => {
    // Rounding up would display more GEN than the escrow actually holds.
    expect(formatGen(ONE + 999_999_999_999_999_999n)).toBe("1.9999");
    expect(formatGen(ONE * 2n - 1n)).toBe("1.9999");
  });

  it("does not render a bare trailing dot for dust amounts", () => {
    expect(formatGen(1n)).toBe("0");
    expect(formatGen(1n)).not.toContain(".");
  });

  it("honours a custom precision", () => {
    expect(formatGen(ONE + ONE / 3n, 2)).toBe("1.33");
    expect(formatGen(ONE + ONE / 3n, 0)).toBe("1");
  });

  it("handles very large escrows without precision loss", () => {
    const huge = 123_456_789n * ONE;
    expect(formatGen(huge)).toBe("123456789");
  });

  it("keeps the sign on negative values", () => {
    expect(formatGen(-ONE)).toBe("-1");
  });
});

describe("parseGen", () => {
  it("parses whole and fractional input", () => {
    expect(parseGen("1")).toBe(ONE);
    expect(parseGen("1.5")).toBe(ONE + ONE / 2n);
    expect(parseGen("0.000000000000000001")).toBe(1n);
    expect(parseGen("500")).toBe(500n * ONE);
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseGen("  2 ")).toBe(2n * ONE);
  });

  it("rejects anything that is not a positive decimal", () => {
    for (const input of [
      "",
      "abc",
      "-1",
      "1.2.3",
      "1e18",
      "1,5",
      ".5",
      "1.",
      "0x10",
      " ",
      "Infinity",
    ]) {
      expect(parseGen(input), input).toBeNull();
    }
  });

  it("rejects more than 18 decimal places instead of truncating silently", () => {
    expect(parseGen("1.0000000000000000001")).toBeNull();
  });

  it("round-trips through formatGen", () => {
    for (const input of ["1", "1.5", "0.25", "1234.5678"]) {
      expect(formatGen(parseGen(input) as bigint)).toBe(input);
    }
  });
});

describe("shortAddr", () => {
  it("abbreviates a full address", () => {
    expect(shortAddr("0x1234567890abcdef1234567890abcdef12345678")).toBe(
      "0x1234…5678"
    );
  });

  it("leaves short or empty strings alone", () => {
    expect(shortAddr("0x1234")).toBe("0x1234");
    expect(shortAddr("")).toBe("");
  });
});

describe("countdownTo", () => {
  const now = 1_700_000_000_000;

  it("breaks the remaining time into parts", () => {
    const target = now / 1000 + 2 * 86400 + 3 * 3600 + 4 * 60 + 5;
    expect(countdownTo(target, now)).toEqual({
      days: 2,
      hours: 3,
      minutes: 4,
      seconds: 5,
      done: false,
    });
  });

  it("reports done at and past the deadline", () => {
    expect(countdownTo(now / 1000, now).done).toBe(true);
    expect(countdownTo(now / 1000 - 10_000, now).done).toBe(true);
  });

  it("treats an unset timestamp as already elapsed", () => {
    expect(countdownTo(0, now).done).toBe(true);
  });

  it("never yields negative parts", () => {
    const c = countdownTo(now / 1000 - 500, now);
    for (const v of [c.days, c.hours, c.minutes, c.seconds]) {
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("countdownLabel", () => {
  it("zero-pads hh:mm:ss", () => {
    expect(
      countdownLabel({ days: 0, hours: 1, minutes: 2, seconds: 3, done: false })
    ).toBe("01:02:03");
  });

  it("prefixes days only when there are any", () => {
    expect(
      countdownLabel({ days: 5, hours: 1, minutes: 2, seconds: 3, done: false })
    ).toBe("5d 01:02:03");
  });

  it("renders a finished countdown as zeroes", () => {
    expect(
      countdownLabel({ days: 0, hours: 0, minutes: 0, seconds: 0, done: true })
    ).toBe("00:00:00");
  });

  it("keeps a fixed width so the odometer does not jump", () => {
    const a = countdownLabel({ days: 0, hours: 9, minutes: 9, seconds: 9, done: false });
    const b = countdownLabel({ days: 0, hours: 10, minutes: 10, seconds: 10, done: false });
    expect(a.length).toBe(b.length);
  });
});

describe("formatDate", () => {
  it("renders a placeholder for an unset timestamp", () => {
    expect(formatDate(0)).toBe("—");
  });

  it("renders a real timestamp", () => {
    expect(formatDate(1_700_000_000)).not.toBe("—");
    expect(formatDate(1_700_000_000).length).toBeGreaterThan(0);
  });
});

describe("errorMessage", () => {
  it("extracts a contract revert reason", () => {
    expect(
      errorMessage(new Error("Error: UserError('only the brand can cancel')"))
    ).toBe("only the brand can cancel");
    expect(errorMessage(new Error("UserError: deal already settled"))).toBe(
      "deal already settled"
    );
  });

  it("humanizes a user-rejected wallet request", () => {
    for (const msg of [
      "User rejected the request.",
      "MetaMask Tx Signature: User denied transaction signature.",
      "user rejected",
    ]) {
      expect(errorMessage(new Error(msg))).toBe("You rejected the wallet request.");
    }
  });

  it("truncates a very long message", () => {
    const out = errorMessage(new Error("x".repeat(500)));
    expect(out.length).toBeLessThanOrEqual(201);
    expect(out.endsWith("…")).toBe(true);
  });

  it("passes a short message through unchanged", () => {
    expect(errorMessage(new Error("network unreachable"))).toBe(
      "network unreachable"
    );
  });

  it("stringifies non-Error values", () => {
    expect(errorMessage("plain string")).toBe("plain string");
    expect(errorMessage(null)).toBe("null");
    expect(errorMessage(undefined)).toBe("undefined");
  });
});
