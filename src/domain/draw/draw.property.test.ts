import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { runDraw, type Exclusion, type Participant } from "./draw";
import { createSeededRandom, shuffle } from "./random";

// Builds a scenario that is guaranteed satisfiable by construction: start
// from a random cyclic rotation (always a valid derangement for n >= 2),
// then pile on random extra exclusions that never touch an edge the
// rotation actually uses. Whatever else happens, the rotation itself
// remains a valid solution, so the draw must succeed.
const scenarioArbitrary = fc
  .integer({ min: 3, max: 15 })
  .chain((participantCount) => {
    const ids = Array.from({ length: participantCount }, (_, i) => `p${i}`);
    return fc.record({
      ids: fc.constant(ids),
      rotationSeed: fc.integer({ min: 0, max: 2 ** 31 - 1 }),
      exclusionSeed: fc.integer({ min: 0, max: 2 ** 31 - 1 }),
      exclusionFraction: fc.double({ min: 0, max: 1, noNaN: true }),
      drawSeed: fc.integer({ min: 0, max: 2 ** 31 - 1 }),
    });
  });

describe("runDraw property tests", () => {
  it("[AC-DRAW-01,02,03] holds the three invariants for any satisfiable exclusion set", () => {
    fc.assert(
      fc.property(
        scenarioArbitrary,
        ({ ids, rotationSeed, exclusionSeed, exclusionFraction, drawSeed }) => {
          const rotation = shuffle(ids, createSeededRandom(rotationSeed));
          const guaranteedEdge = new Map<string, string>();
          for (let i = 0; i < rotation.length; i++) {
            guaranteedEdge.set(rotation[i], rotation[(i + 1) % rotation.length]);
          }

          const candidatePairs: Exclusion[] = [];
          for (const giverId of ids) {
            for (const receiverId of ids) {
              if (giverId === receiverId) continue;
              if (guaranteedEdge.get(giverId) === receiverId) continue;
              candidatePairs.push({ giverId, receiverId });
            }
          }

          const shuffledPairs = shuffle(candidatePairs, createSeededRandom(exclusionSeed));
          const exclusions = shuffledPairs.slice(
            0,
            Math.floor(shuffledPairs.length * exclusionFraction),
          );

          const participants: Participant[] = ids.map((id) => ({ id }));
          const result = runDraw(participants, exclusions, createSeededRandom(drawSeed));

          expect(result.ok).toBe(true);
          if (!result.ok) return;

          const givers = new Set(result.assignments.map((a) => a.giverId));
          const receivers = new Set(result.assignments.map((a) => a.receiverId));
          expect(givers.size).toBe(ids.length);
          expect(receivers.size).toBe(ids.length);

          for (const { giverId, receiverId } of result.assignments) {
            expect(giverId).not.toBe(receiverId);
            expect(
              exclusions.some(
                (e) => e.giverId === giverId && e.receiverId === receiverId,
              ),
            ).toBe(false);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
