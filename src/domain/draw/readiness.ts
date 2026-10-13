// Whether wishes are required is a precondition checked before runDraw is
// even called (SPEC.md "The draw"), not part of the matching algorithm
// itself — kept separate so runDraw stays a pure (participants, exclusions)
// in, assignments out function.
export interface ReadinessParticipant {
  id: string;
  hasWishes: boolean;
}

export type ReadinessResult =
  | { ready: true }
  | { ready: false; notReadyParticipantIds: string[] };

export function checkDrawReadiness(
  participants: ReadinessParticipant[],
  wishesRequired: boolean,
): ReadinessResult {
  if (!wishesRequired) {
    return { ready: true };
  }

  const notReadyParticipantIds = participants
    .filter((p) => !p.hasWishes)
    .map((p) => p.id);

  if (notReadyParticipantIds.length === 0) {
    return { ready: true };
  }

  return { ready: false, notReadyParticipantIds };
}
