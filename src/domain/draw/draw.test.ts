import { describe, expect, it } from "vitest";
import { runDraw, type Exclusion, type Participant } from "./draw";
import { createSeededRandom } from "./random";

function participantsOf(...ids: string[]): Participant[] {
  return ids.map((id) => ({ id }));
}

describe("runDraw", () => {
  it("[AC-DRAW-05] blocks the draw with fewer than 3 participants", () => {
    const result = runDraw(participantsOf("a", "b"), [], createSeededRandom(1));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("too_few_participants");
  });

  it("[AC-DRAW-01,02,03] assigns everyone exactly once with no self-match, exactly 3 people, no exclusions", () => {
    const participants = participantsOf("a", "b", "c");
    const result = runDraw(participants, [], createSeededRandom(42));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.assignments).toHaveLength(3);
    expect(new Set(result.assignments.map((a) => a.giverId)).size).toBe(3);
    expect(new Set(result.assignments.map((a) => a.receiverId)).size).toBe(3);
    for (const { giverId, receiverId } of result.assignments) {
      expect(giverId).not.toBe(receiverId);
    }
  });

  it("[AC-DRAW-03] never violates an exclusion even when it's the only way to avoid it", () => {
    // a->b and a->c both excluded: a must receive from b or c's remaining
    // slot naturally, but must give to... actually here a can only give to
    // nothing but itself unless exclusions leave something; use a case
    // where a has exactly one allowed receiver.
    const participants = participantsOf("a", "b", "c");
    const exclusions: Exclusion[] = [{ giverId: "a", receiverId: "b" }];
    const result = runDraw(participants, exclusions, createSeededRandom(7));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const aAssignment = result.assignments.find((x) => x.giverId === "a");
    expect(aAssignment?.receiverId).toBe("c");
  });

  it("[AC-DRAW-04] reports the blocking exclusions when someone is excluded from everyone else", () => {
    const participants = participantsOf("a", "b", "c");
    const exclusions: Exclusion[] = [
      { giverId: "a", receiverId: "b" },
      { giverId: "a", receiverId: "c" },
    ];
    const result = runDraw(participants, exclusions, createSeededRandom(3));

    expect(result.ok).toBe(false);
    if (result.ok || result.reason !== "infeasible_exclusions") return;
    expect(result.blockingParticipantIds).toContain("a");
    expect(result.blockingExclusions).toEqual(
      expect.arrayContaining(exclusions),
    );
    expect(result.blockingExclusions).toHaveLength(2);
  });

  it("[AC-DRAW-04] reports the blocking exclusions when everyone is excluded from giving to one person", () => {
    const participants = participantsOf("a", "b", "c", "d");
    const exclusions: Exclusion[] = [
      { giverId: "a", receiverId: "d" },
      { giverId: "b", receiverId: "d" },
      { giverId: "c", receiverId: "d" },
    ];
    const result = runDraw(participants, exclusions, createSeededRandom(11));

    expect(result.ok).toBe(false);
    if (result.ok || result.reason !== "infeasible_exclusions") return;
    // Nobody is allowed to give to "d", so no valid draw exists and every
    // exclusion involved (all of them, here) is reported as blocking.
    expect(result.blockingExclusions).toEqual(
      expect.arrayContaining(exclusions),
    );
  });

  it("[AC-DRAW-01] succeeds with a satisfiable exclusion set larger than 3 people", () => {
    const participants = participantsOf("a", "b", "c", "d", "e");
    const exclusions: Exclusion[] = [
      { giverId: "a", receiverId: "b" },
      { giverId: "b", receiverId: "a" },
    ];
    const result = runDraw(participants, exclusions, createSeededRandom(99));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.assignments).toHaveLength(5);
  });

  it("is deterministic for a given seed (replayable failures)", () => {
    const participants = participantsOf("a", "b", "c", "d");
    const resultA = runDraw(participants, [], createSeededRandom(123));
    const resultB = runDraw(participants, [], createSeededRandom(123));

    expect(resultA).toEqual(resultB);
  });
});
