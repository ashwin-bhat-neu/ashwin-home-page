/**
 * Text scrambler — the phrase in the hero that resolves out of noise.
 *
 * The effect is the usual one, with two constraints that matter more than the
 * animation itself:
 *
 *   1. The final text of the first phrase is already in the markup, so the
 *      sentence reads correctly with scripting disabled and the module only
 *      ever replaces text that is already there.
 *   2. The element reserves its width in CSS, so characters churning through
 *      different glyphs never reflow the paragraph around them.
 */

/** Glyphs the noise is drawn from. Punctuation-heavy on purpose: it reads as
 *  machine noise rather than as a word being mistyped. */
const noiseGlyphs = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/\\|<>_-+*=";

/** How long each character waits before it settles. At 45ms a six-word phrase
 *  resolves in about a second, which is long enough to read as an effect and
 *  short enough not to be in the way. */
const millisecondsPerCharacter = 45;

/** How often the unresolved tail is redrawn. Matching the reveal rate keeps
 *  the churn legible; much faster and it turns into a grey smear. */
const noiseIntervalMilliseconds = 45;

/** How long a fully resolved phrase is held before the next one starts. */
const holdMilliseconds = 2600;

/** Separator between phrases in the data attribute. */
const phraseSeparator = "|";

/**
 * Start cycling an element through its phrases.
 *
 * Phrases are read from `data-scramble-phrases` on the element itself, so the
 * copy stays in the markup with the sentence it belongs to rather than being
 * stranded in a script.
 *
 * @param {HTMLElement} element The element whose text is animated.
 * @param {object} options
 * @param {() => number} options.random Seeded generator for the noise.
 * @param {boolean} options.animate False to leave the markup text untouched.
 * @returns {{stop: () => void} | null} Null when there is nothing to cycle.
 */
export function createTextScrambler(element, { random, animate }) {
  const phrases = (element.dataset.scramblePhrases ?? "")
    .split(phraseSeparator)
    .map((phrase) => phrase.trim())
    .filter((phrase) => phrase.length > 0);

  // With one phrase or none there is nothing to cycle between, and under
  // reduced motion the markup text is already the right answer.
  if (!animate || phrases.length < 2) {
    return null;
  }

  let phraseIndex = 0;
  let targetText = phrases[0];
  let phraseStartMilliseconds = 0;
  let lastNoiseMilliseconds = 0;
  let holdUntilMilliseconds = 0;
  let noiseText = "";
  let animationHandle = 0;

  /**
   * Build a run of noise.
   *
   * @param {number} length How many glyphs are still unresolved.
   * @returns {string}
   */
  function buildNoise(length) {
    let output = "";
    for (let index = 0; index < length; index += 1) {
      output += noiseGlyphs[Math.floor(random() * noiseGlyphs.length)];
    }
    return output;
  }

  /**
   * One animation step: reveal the prefix, churn the rest, then hold.
   *
   * @param {number} timestampMilliseconds Supplied by requestAnimationFrame.
   */
  function step(timestampMilliseconds) {
    if (phraseStartMilliseconds === 0) {
      phraseStartMilliseconds = timestampMilliseconds;
    }

    const elapsed = timestampMilliseconds - phraseStartMilliseconds;
    const revealedCount = Math.min(
      targetText.length,
      Math.floor(elapsed / millisecondsPerCharacter)
    );
    const remainingCount = targetText.length - revealedCount;

    // Redraw the tail on its own cadence, or immediately when a character has
    // just resolved and the tail is now the wrong length.
    const noiseIsStale =
      timestampMilliseconds - lastNoiseMilliseconds >=
      noiseIntervalMilliseconds;
    if (noiseIsStale || noiseText.length !== remainingCount) {
      noiseText = buildNoise(remainingCount);
      lastNoiseMilliseconds = timestampMilliseconds;
    }

    element.textContent = targetText.slice(0, revealedCount) + noiseText;

    if (remainingCount === 0) {
      if (holdUntilMilliseconds === 0) {
        holdUntilMilliseconds = timestampMilliseconds + holdMilliseconds;
      } else if (timestampMilliseconds >= holdUntilMilliseconds) {
        // Advance to the next phrase and reset the per-phrase clocks.
        phraseIndex = (phraseIndex + 1) % phrases.length;
        targetText = phrases[phraseIndex];
        phraseStartMilliseconds = timestampMilliseconds;
        holdUntilMilliseconds = 0;
      }
    }

    animationHandle = window.requestAnimationFrame(step);
  }

  animationHandle = window.requestAnimationFrame(step);

  return {
    stop() {
      window.cancelAnimationFrame(animationHandle);
      // Leave the element on a whole phrase rather than mid-churn.
      element.textContent = targetText;
    },
  };
}
