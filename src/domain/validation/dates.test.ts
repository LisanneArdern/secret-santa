import { describe, expect, it } from "vitest";
import { validateRoundDates } from "./dates";

const now = new Date("2026-10-01T00:00:00Z");

describe("validateRoundDates", () => {
  it("accepts a signup deadline in the future with no exchange date", () => {
    const result = validateRoundDates({
      signupDeadline: new Date("2026-11-01T00:00:00Z"),
      now,
    });
    expect(result.ok).toBe(true);
  });

  it("[AC-EDGE-03] rejects a signup deadline in the past", () => {
    const result = validateRoundDates({
      signupDeadline: new Date("2026-09-01T00:00:00Z"),
      now,
    });
    expect(result).toEqual({ ok: false, reason: "signup_deadline_in_past" });
  });

  it("[AC-EDGE-03] rejects a signup deadline after the exchange date", () => {
    const result = validateRoundDates({
      signupDeadline: new Date("2026-12-25T00:00:00Z"),
      exchangeDate: new Date("2026-12-01T00:00:00Z"),
      now,
    });
    expect(result).toEqual({
      ok: false,
      reason: "signup_deadline_after_exchange_date",
    });
  });

  it("accepts a signup deadline on or before the exchange date", () => {
    const result = validateRoundDates({
      signupDeadline: new Date("2026-12-01T00:00:00Z"),
      exchangeDate: new Date("2026-12-25T00:00:00Z"),
      now,
    });
    expect(result.ok).toBe(true);
  });
});
