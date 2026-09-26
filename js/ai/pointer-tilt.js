/**
 * Pointer tilt — rotates the subsystem cards towards the cursor.
 *
 * The module's only job is to measure the pointer against each card and write
 * two numbers onto it. The transform that consumes them lives in css/ai.css,
 * which means the motion can be tuned, or switched off under a media query,
 * without this file changing at all.
 */

/** Maximum rotation on either axis. Past about 8 degrees the text on the card
 *  starts to look distorted rather than tilted. */
const maxTiltDegrees = 6;

/**
 * Attach tilt behaviour to a set of cards.
 *
 * Coarse pointers are skipped: on a touch screen the events only arrive once
 * the card has already been tapped, so the tilt would fire as a jolt after the
 * fact rather than as feedback.
 *
 * @param {Iterable<HTMLElement>} cards The elements to tilt.
 * @param {object} options
 * @param {boolean} options.animate False to leave every card flat.
 * @returns {{stop: () => void}}
 */
export function createPointerTilt(cards, { animate }) {
  const hasFinePointer = window.matchMedia("(pointer: fine)").matches;
  const cleanupCallbacks = [];

  if (animate && hasFinePointer) {
    for (const card of cards) {
      /**
       * Map the pointer's position within the card onto rotation.
       *
       * The vertical offset drives rotateX and the horizontal offset drives
       * rotateY, and the vertical one is negated so the card leans towards the
       * cursor rather than away from it.
       *
       * @param {PointerEvent} event
       */
      const handleMove = (event) => {
        const bounds = card.getBoundingClientRect();
        // Normalised to [-0.5, 0.5], measured from the centre of the card.
        const offsetX = (event.clientX - bounds.left) / bounds.width - 0.5;
        const offsetY = (event.clientY - bounds.top) / bounds.height - 0.5;
        card.style.setProperty(
          "--tilt-x",
          `${(-offsetY * maxTiltDegrees * 2).toFixed(2)}deg`
        );
        card.style.setProperty(
          "--tilt-y",
          `${(offsetX * maxTiltDegrees * 2).toFixed(2)}deg`
        );
      };

      // Removing the properties returns the card to the flat fallback in the
      // stylesheet, and the CSS transition carries it back smoothly.
      const handleLeave = () => {
        card.style.removeProperty("--tilt-x");
        card.style.removeProperty("--tilt-y");
      };

      card.addEventListener("pointermove", handleMove);
      card.addEventListener("pointerleave", handleLeave);
      cleanupCallbacks.push(() => {
        card.removeEventListener("pointermove", handleMove);
        card.removeEventListener("pointerleave", handleLeave);
        handleLeave();
      });
    }
  }

  return {
    stop() {
      for (const cleanup of cleanupCallbacks) {
        cleanup();
      }
    },
  };
}
