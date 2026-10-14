// The clock-triggered half of the lifecycle (SPEC.md: Drawn->Completed on
// the exchange date, Completed->Archived 60 days after it) plus the
// signup-deadline-approaching reminder. Pure functions taking `now`
// explicitly (same pattern as validateRoundDates) rather than reading the
// system clock themselves, so they're tested with fixed dates instead of
// real waiting.
//
// AC-EDGE-07 ("deadlines trigger at the same moment regardless of the
// viewer's timezone"): every comparison here is between two `Date`
// instances, which JavaScript always stores as an absolute instant (epoch
// milliseconds) with no timezone attached — timezone only ever affects
// how a Date is *displayed*, never these comparisons. There is no
// viewer-timezone input anywhere in this module to get wrong.
export const ARCHIVE_AFTER_EXCHANGE_MS = 60 * 24 * 60 * 60 * 1000;
export const SIGNUP_REMINDER_DAYS_BEFORE = 3;

export function shouldCompleteRound(
  round: { state: string; exchangeDate: Date | null },
  now: Date,
): boolean {
  return round.state === "drawn" && round.exchangeDate !== null && round.exchangeDate <= now;
}

// AC-PRIV-05: 60 days after the exchange date, all personal data of the
// round is deleted. A round with no exchange date set never reaches this
// automatically (it simply stays completed indefinitely) — there is no
// reference point to count 60 days from.
export function shouldArchiveRound(
  round: { state: string; exchangeDate: Date | null },
  now: Date,
): boolean {
  if (round.state !== "completed" || round.exchangeDate === null) {
    return false;
  }
  const archiveAt = new Date(round.exchangeDate.getTime() + ARCHIVE_AFTER_EXCHANGE_MS);
  return archiveAt <= now;
}

export function isSignupReminderDue(
  round: { state: string; signupDeadline: Date; signupReminderSentAt: Date | null },
  now: Date,
  daysBefore: number = SIGNUP_REMINDER_DAYS_BEFORE,
): boolean {
  if (round.state !== "open" || round.signupReminderSentAt !== null) {
    return false;
  }
  const reminderWindowStart = new Date(
    round.signupDeadline.getTime() - daysBefore * 24 * 60 * 60 * 1000,
  );
  return now >= reminderWindowStart && now < round.signupDeadline;
}
