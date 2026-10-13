import { describe, expect, it } from "vitest";
import { runDraw } from "./draw";
import { checkDrawReadiness } from "./readiness";
import { createSeededRandom } from "./random";

describe("checkDrawReadiness", () => {
  it("is always ready when wishes are not required", () => {
    const result = checkDrawReadiness(
      [{ id: "a", hasWishes: false }],
      false,
    );
    expect(result.ready).toBe(true);
  });

  it("[AC-DRAW-06] blocks when wishes are required and someone has none, naming who", () => {
    const result = checkDrawReadiness(
      [
        { id: "a", hasWishes: true },
        { id: "b", hasWishes: false },
        { id: "c", hasWishes: false },
      ],
      true,
    );

    expect(result.ready).toBe(false);
    if (result.ready) return;
    expect(result.notReadyParticipantIds).toEqual(["b", "c"]);
  });

  it("[AC-DRAW-07] the draw can run once every remaining participant is ready", () => {
    const allParticipants = [
      { id: "a", hasWishes: true },
      { id: "b", hasWishes: true },
      { id: "c", hasWishes: true },
      { id: "d", hasWishes: false },
    ];

    const before = checkDrawReadiness(allParticipants, true);
    expect(before.ready).toBe(false);

    // Organiser removes the not-ready participant, then draws manually.
    const remaining = allParticipants.filter((p) => p.id !== "d");
    const after = checkDrawReadiness(remaining, true);
    expect(after.ready).toBe(true);

    const result = runDraw(remaining, [], createSeededRandom(1));
    expect(result.ok).toBe(true);
  });
});
