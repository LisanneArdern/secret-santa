// Injectable randomness so a draw's outcome is reproducible from its seed
// (SPEC.md Testing guidelines: "the draw uses an injectable random source
// so failures can be replayed with the same seed").
export interface RandomSource {
  /** Returns a float in [0, 1). */
  next(): number;
}

// mulberry32: small, fast, deterministic given a seed.
export function createSeededRandom(seed: number): RandomSource {
  let state = seed >>> 0;

  return {
    next(): number {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

export function shuffle<T>(items: readonly T[], random: RandomSource): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random.next() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
