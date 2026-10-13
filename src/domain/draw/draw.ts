import { shuffle, type RandomSource } from "./random";

export interface Participant {
  id: string;
}

// Directional: giverId must not be assigned receiverId.
export interface Exclusion {
  giverId: string;
  receiverId: string;
}

export interface Assignment {
  giverId: string;
  receiverId: string;
}

export const MINIMUM_PARTICIPANTS = 3;

export type DrawResult =
  | { ok: true; assignments: Assignment[] }
  | {
      ok: false;
      reason: "too_few_participants";
      minimumRequired: number;
      actual: number;
    }
  | {
      ok: false;
      reason: "infeasible_exclusions";
      // The participants whose combined exclusions make a full round
      // impossible, and the exclusions responsible for it.
      blockingParticipantIds: string[];
      blockingExclusions: Exclusion[];
    };

/**
 * Assigns each participant exactly one giftee so that everyone gives and
 * receives exactly once, nobody draws themselves, and no exclusion is
 * violated. Pure and framework-free: participants and exclusions in,
 * assignments or an explained failure out (SPEC.md "The draw").
 */
export function runDraw(
  participants: Participant[],
  exclusions: Exclusion[],
  random: RandomSource,
): DrawResult {
  if (participants.length < MINIMUM_PARTICIPANTS) {
    return {
      ok: false,
      reason: "too_few_participants",
      minimumRequired: MINIMUM_PARTICIPANTS,
      actual: participants.length,
    };
  }

  const excludedReceiversByGiver = new Map<string, Set<string>>();
  for (const { giverId, receiverId } of exclusions) {
    const set = excludedReceiversByGiver.get(giverId) ?? new Set<string>();
    set.add(receiverId);
    excludedReceiversByGiver.set(giverId, set);
  }

  const ids = participants.map((p) => p.id);
  const giverOrder = shuffle(ids, random);

  const allowedReceivers = new Map<string, string[]>();
  for (const giverId of giverOrder) {
    const excluded = excludedReceiversByGiver.get(giverId);
    const candidates = ids.filter(
      (receiverId) => receiverId !== giverId && !excluded?.has(receiverId),
    );
    allowedReceivers.set(giverId, shuffle(candidates, random));
  }

  // Kuhn's algorithm: augmenting-path bipartite matching between givers and
  // receivers (the same people on both sides).
  const receiverToGiver = new Map<string, string>();
  const giverToReceiver = new Map<string, string>();

  function tryAugment(giverId: string, visitedReceivers: Set<string>): boolean {
    for (const receiverId of allowedReceivers.get(giverId) ?? []) {
      if (visitedReceivers.has(receiverId)) continue;
      visitedReceivers.add(receiverId);

      const currentGiver = receiverToGiver.get(receiverId);
      if (currentGiver === undefined || tryAugment(currentGiver, visitedReceivers)) {
        receiverToGiver.set(receiverId, giverId);
        giverToReceiver.set(giverId, receiverId);
        return true;
      }
    }
    return false;
  }

  for (const giverId of giverOrder) {
    tryAugment(giverId, new Set());
  }

  const unmatchedGivers = giverOrder.filter((id) => !giverToReceiver.has(id));

  if (unmatchedGivers.length === 0) {
    return {
      ok: true,
      assignments: giverOrder.map((giverId) => ({
        giverId,
        receiverId: giverToReceiver.get(giverId)!,
      })),
    };
  }

  const blockingParticipantIds = [
    ...findHallViolatingGivers(unmatchedGivers[0], allowedReceivers, receiverToGiver),
  ];
  const blockingParticipantIdSet = new Set(blockingParticipantIds);
  const blockingExclusions = exclusions.filter((e) =>
    blockingParticipantIdSet.has(e.giverId),
  );

  return {
    ok: false,
    reason: "infeasible_exclusions",
    blockingParticipantIds,
    blockingExclusions,
  };
}

/**
 * Standard alternating-path search from an unmatched giver: the set of
 * givers it finds is a Hall violator (by König's theorem), meaning they
 * collectively have fewer allowed receivers between them than there are
 * givers in the set — the exact reason the draw is impossible.
 */
function findHallViolatingGivers(
  startGiverId: string,
  allowedReceivers: Map<string, string[]>,
  receiverToGiver: Map<string, string>,
): Set<string> {
  const deficientGivers = new Set<string>([startGiverId]);
  const reachableReceivers = new Set<string>();
  let frontier = [startGiverId];

  while (frontier.length > 0) {
    const nextFrontier: string[] = [];
    for (const giverId of frontier) {
      for (const receiverId of allowedReceivers.get(giverId) ?? []) {
        if (reachableReceivers.has(receiverId)) continue;
        reachableReceivers.add(receiverId);

        const matchedGiver = receiverToGiver.get(receiverId);
        if (matchedGiver !== undefined && !deficientGivers.has(matchedGiver)) {
          deficientGivers.add(matchedGiver);
          nextFrontier.push(matchedGiver);
        }
      }
    }
    frontier = nextFrontier;
  }

  return deficientGivers;
}
