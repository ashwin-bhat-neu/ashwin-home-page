/**
 * A small, seedable pseudo-random number generator (mulberry32).
 *
 * The page uses this instead of `Math.random` so that the visual noise on it —
 * the phase offset of every lattice cell, the characters the scrambler churns
 * through — is identical on every load. That makes the page reproducible: a
 * screenshot taken today can be compared against one taken next month, and a
 * rendering bug can be chased without it moving between refreshes.
 *
 * One generator is created in the entry point and threaded into the modules
 * that need randomness, rather than each module reaching for its own source.
 *
 * @param {number} seed Any 32-bit integer. The same seed yields the same run.
 * @returns {() => number} A function returning floats in the range [0, 1).
 */
export function createSeededRandom(seed) {
  // Kept as an unsigned 32-bit value; the generator is defined over that ring
  // and the `>>> 0` coercions below are what keep it there.
  let state = seed >>> 0;

  return function nextUnitFloat() {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    // Divide by 2^32 to land in [0, 1), matching Math.random's contract.
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}
