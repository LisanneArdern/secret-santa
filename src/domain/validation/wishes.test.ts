import { describe, expect, it } from "vitest";
import { MAX_WISHES_LENGTH, validateWishesLength } from "./wishes";

describe("validateWishesLength", () => {
  it("accepts text at or under the limit", () => {
    expect(validateWishesLength("a".repeat(MAX_WISHES_LENGTH)).ok).toBe(true);
  });

  it("accepts emoji and preserves length semantics without special-casing them", () => {
    expect(validateWishesLength("🎁".repeat(100)).ok).toBe(true);
  });

  it("rejects text over the limit", () => {
    const result = validateWishesLength("a".repeat(MAX_WISHES_LENGTH + 1));
    expect(result).toEqual({
      ok: false,
      reason: "too_long",
      maxLength: MAX_WISHES_LENGTH,
    });
  });
});
