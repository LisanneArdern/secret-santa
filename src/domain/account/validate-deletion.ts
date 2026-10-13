import type { RoundState } from "../round-lifecycle/state-machine";

// SPEC.md edge case: "Organiser deletes their account during an open or
// drawn round" -> "Account deletion is blocked until the organiser cancels
// or completes their rounds" (AC-EDGE-10).
export interface OrganisedRound {
  state: RoundState;
}

export type AccountDeletionResult =
  | { ok: true }
  | { ok: false; reason: "has_open_or_drawn_round"; blockingRoundCount: number };

export function canDeleteAccount(organisedRounds: OrganisedRound[]): AccountDeletionResult {
  const blockingRoundCount = organisedRounds.filter(
    (r) => r.state === "open" || r.state === "drawn",
  ).length;

  if (blockingRoundCount > 0) {
    return { ok: false, reason: "has_open_or_drawn_round", blockingRoundCount };
  }

  return { ok: true };
}
