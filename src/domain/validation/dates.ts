// SPEC.md edge case: "Signup deadline in the past, or after the exchange
// date" must be rejected (AC-EDGE-03). `now` is passed in rather than read
// from the system clock so this stays pure and testable with a fake time.
export interface RoundDatesInput {
  signupDeadline: Date;
  exchangeDate?: Date;
  now: Date;
}

export type RoundDatesValidationResult =
  | { ok: true }
  | { ok: false; reason: "signup_deadline_in_past" }
  | { ok: false; reason: "signup_deadline_after_exchange_date" };

export function validateRoundDates({
  signupDeadline,
  exchangeDate,
  now,
}: RoundDatesInput): RoundDatesValidationResult {
  if (signupDeadline.getTime() <= now.getTime()) {
    return { ok: false, reason: "signup_deadline_in_past" };
  }

  if (exchangeDate && signupDeadline.getTime() > exchangeDate.getTime()) {
    return { ok: false, reason: "signup_deadline_after_exchange_date" };
  }

  return { ok: true };
}
