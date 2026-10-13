import { describe, expect, it } from "vitest";
import { canDeleteAccount } from "./validate-deletion";

describe("canDeleteAccount", () => {
  it("allows deletion with no organised rounds", () => {
    expect(canDeleteAccount([])).toEqual({ ok: true });
  });

  it("allows deletion when all organised rounds are draft, completed, archived or cancelled", () => {
    const result = canDeleteAccount([
      { state: "draft" },
      { state: "completed" },
      { state: "archived" },
      { state: "cancelled" },
    ]);
    expect(result).toEqual({ ok: true });
  });

  it("[AC-EDGE-10] blocks deletion with an open round", () => {
    const result = canDeleteAccount([{ state: "open" }]);
    expect(result).toEqual({
      ok: false,
      reason: "has_open_or_drawn_round",
      blockingRoundCount: 1,
    });
  });

  it("[AC-EDGE-10] blocks deletion with a drawn round, counting all blocking rounds", () => {
    const result = canDeleteAccount([{ state: "drawn" }, { state: "open" }, { state: "draft" }]);
    expect(result).toEqual({
      ok: false,
      reason: "has_open_or_drawn_round",
      blockingRoundCount: 2,
    });
  });
});
