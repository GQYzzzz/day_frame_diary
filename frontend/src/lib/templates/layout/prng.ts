/** 可复现的 seeded PRNG（LCG） */
export function createRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export function rngBetween(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}
