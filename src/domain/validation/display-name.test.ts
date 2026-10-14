import { describe, expect, it } from "vitest";
import { MAX_DISPLAY_NAME_LENGTH, validateDisplayName } from "./display-name";

describe("validateDisplayName", () => {
  it("accepts a normal name", () => {
    expect(validateDisplayName("Bob")).toEqual({ ok: true, value: "Bob" });
  });

  it("trims surrounding whitespace", () => {
    expect(validateDisplayName("  Bob  ")).toEqual({ ok: true, value: "Bob" });
  });

  it("rejects an empty name", () => {
    expect(validateDisplayName("")).toEqual({ ok: false, reason: "empty" });
  });

  it("rejects a name that's only whitespace", () => {
    expect(validateDisplayName("   ")).toEqual({ ok: false, reason: "empty" });
  });

  it("rejects a name longer than the limit", () => {
    const tooLong = "a".repeat(MAX_DISPLAY_NAME_LENGTH + 1);
    expect(validateDisplayName(tooLong)).toEqual({
      ok: false,
      reason: "too_long",
      maxLength: MAX_DISPLAY_NAME_LENGTH,
    });
  });

  it("accepts a name exactly at the limit", () => {
    const atLimit = "a".repeat(MAX_DISPLAY_NAME_LENGTH);
    expect(validateDisplayName(atLimit)).toEqual({ ok: true, value: atLimit });
  });
});
