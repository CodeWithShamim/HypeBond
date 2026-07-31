import { describe, expect, it } from "vitest";
import type { User } from "@privy-io/react-auth";
import { describeUser } from "./privy";

const user = (fields: Partial<User>) => ({ ...fields }) as User;

/**
 * With an embedded wallet the address is a Privy-minted string the user has
 * never seen, so it says nothing about *who* is connected. The login identity
 * is the only recognizable handle, and it's what the account menu leads with.
 */
describe("describeUser", () => {
  it("prefers the linked email", () => {
    expect(
      describeUser(
        user({
          email: { address: "creator@example.com" },
          google: { email: "other@example.com" },
        } as Partial<User>)
      )
    ).toBe("creator@example.com");
  });

  it("falls back to the Google address, then the Twitter handle", () => {
    expect(
      describeUser(user({ google: { email: "g@example.com" } } as Partial<User>))
    ).toBe("g@example.com");
    expect(
      describeUser(user({ twitter: { username: "hypebond" } } as Partial<User>))
    ).toBe("@hypebond");
  });

  it("names an external wallet client but not the embedded one", () => {
    expect(
      describeUser(
        user({ wallet: { walletClientType: "coinbase_wallet" } } as Partial<User>)
      )
    ).toBe("coinbase wallet");
    // An embedded wallet has no identity of its own to report.
    expect(
      describeUser(user({ wallet: { walletClientType: "privy" } } as Partial<User>))
    ).toBeNull();
  });

  it("has nothing to say about a signed-out visitor", () => {
    expect(describeUser(null)).toBeNull();
  });
});
