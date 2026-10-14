import { describe, expect, it } from "vitest";
import {
  isSignupReminderDue,
  shouldArchiveRound,
  shouldCompleteRound,
} from "./scheduled-transitions";

const now = new Date("2026-12-10T00:00:00Z");

describe("shouldCompleteRound", () => {
  it("is true once the exchange date has passed for a drawn round", () => {
    expect(
      shouldCompleteRound({ state: "drawn", exchangeDate: new Date("2026-12-09T00:00:00Z") }, now),
    ).toBe(true);
  });

  it("is true the instant the exchange date is reached", () => {
    expect(
      shouldCompleteRound({ state: "drawn", exchangeDate: new Date("2026-12-10T00:00:00Z") }, now),
    ).toBe(true);
  });

  it("is false before the exchange date", () => {
    expect(
      shouldCompleteRound({ state: "drawn", exchangeDate: new Date("2026-12-11T00:00:00Z") }, now),
    ).toBe(false);
  });

  it("is false for a round with no exchange date set", () => {
    expect(shouldCompleteRound({ state: "drawn", exchangeDate: null }, now)).toBe(false);
  });

  it("is false for a round that isn't drawn", () => {
    expect(
      shouldCompleteRound({ state: "open", exchangeDate: new Date("2026-12-01T00:00:00Z") }, now),
    ).toBe(false);
  });

  // AC-EDGE-07: a Date carries no timezone — displaying `now` as if read
  // from a viewer in a different timezone doesn't change the instant it
  // represents, so the comparison is unaffected either way.
  it("[AC-EDGE-07] triggers at the same instant regardless of what timezone `now` is interpreted in", () => {
    const sameInstantDifferentOffset = new Date("2026-12-10T13:00:00+13:00");
    expect(
      shouldCompleteRound(
        { state: "drawn", exchangeDate: new Date("2026-12-10T00:00:00Z") },
        sameInstantDifferentOffset,
      ),
    ).toBe(true);
  });
});

describe("shouldArchiveRound", () => {
  const exchangeDate = new Date("2026-12-01T00:00:00Z");

  it("is false before 60 days have passed", () => {
    const fiftyNineDaysLater = new Date(exchangeDate.getTime() + 59 * 24 * 60 * 60 * 1000);
    expect(shouldArchiveRound({ state: "completed", exchangeDate }, fiftyNineDaysLater)).toBe(false);
  });

  it("[AC-PRIV-05] is true once 60 days have passed", () => {
    const sixtyDaysLater = new Date(exchangeDate.getTime() + 60 * 24 * 60 * 60 * 1000);
    expect(shouldArchiveRound({ state: "completed", exchangeDate }, sixtyDaysLater)).toBe(true);
  });

  it("is false for a round that isn't completed yet", () => {
    const sixtyDaysLater = new Date(exchangeDate.getTime() + 60 * 24 * 60 * 60 * 1000);
    expect(shouldArchiveRound({ state: "drawn", exchangeDate }, sixtyDaysLater)).toBe(false);
  });

  it("never archives a round with no exchange date set", () => {
    const farFuture = new Date("2099-01-01T00:00:00Z");
    expect(shouldArchiveRound({ state: "completed", exchangeDate: null }, farFuture)).toBe(false);
  });
});

describe("isSignupReminderDue", () => {
  const signupDeadline = new Date("2026-12-10T00:00:00Z");

  it("is false more than 3 days before the deadline", () => {
    const fourDaysBefore = new Date("2026-12-06T00:00:00Z");
    expect(
      isSignupReminderDue({ state: "open", signupDeadline, signupReminderSentAt: null }, fourDaysBefore),
    ).toBe(false);
  });

  it("is true within 3 days of the deadline", () => {
    const twoDaysBefore = new Date("2026-12-08T00:00:00Z");
    expect(
      isSignupReminderDue({ state: "open", signupDeadline, signupReminderSentAt: null }, twoDaysBefore),
    ).toBe(true);
  });

  it("is false once the deadline has passed", () => {
    const afterDeadline = new Date("2026-12-11T00:00:00Z");
    expect(
      isSignupReminderDue({ state: "open", signupDeadline, signupReminderSentAt: null }, afterDeadline),
    ).toBe(false);
  });

  it("is false once the reminder has already been sent", () => {
    const twoDaysBefore = new Date("2026-12-08T00:00:00Z");
    expect(
      isSignupReminderDue(
        { state: "open", signupDeadline, signupReminderSentAt: new Date("2026-12-07T00:00:00Z") },
        twoDaysBefore,
      ),
    ).toBe(false);
  });

  it("is false for a round that isn't open", () => {
    const twoDaysBefore = new Date("2026-12-08T00:00:00Z");
    expect(
      isSignupReminderDue({ state: "draft", signupDeadline, signupReminderSentAt: null }, twoDaysBefore),
    ).toBe(false);
  });
});
