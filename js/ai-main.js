/**
 * Entry point for the Lab page.
 *
 * Each behaviour on this page lives in its own module under js/ai/ and knows
 * nothing about the others. This file is the only place that touches the
 * document as a whole: it finds the elements, decides whether the page is
 * allowed to animate, threads one random generator through everything that
 * needs randomness, and declares the command registry.
 *
 * Nothing here throws if an element is missing. The page is a static document
 * first and an instrument second, so a missing canvas should cost the reader
 * an animation, not the rest of the page.
 */

import { createSeededRandom } from "./ai/seeded-random.js";
import { createLatticeField } from "./ai/lattice-field.js";
import { createTextScrambler } from "./ai/text-scrambler.js";
import { createPointerTilt } from "./ai/pointer-tilt.js";
import { createTelemetryPanel } from "./ai/telemetry-panel.js";
import { createCommandPalette } from "./ai/command-palette.js";

/** Fixed seed. Any value works; holding it constant is the point, because it
 *  makes every load of the page render the same noise. See seeded-random.js. */
const randomSeed = 0x5eed;

/**
 * Whether this reader has asked their system for less animation.
 *
 * Checked once at startup rather than watched: a change mid-session is rare,
 * and reloading is a reasonable price for it.
 *
 * @returns {boolean}
 */
function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Build the navigation commands from the site header.
 *
 * The page order is read out of the nav rather than written down again here,
 * so adding a page to the header adds it to the palette. The previous and
 * next pages get `h` and `l`, which is what the hand-written pages bind them
 * to, and the page you are already on is left out of the list.
 *
 * @returns {Array<object>} Command definitions.
 */
function buildPageCommands() {
  const links = Array.from(document.querySelectorAll(".site-nav__link"));
  const currentIndex = links.findIndex(
    (link) => link.getAttribute("aria-current") === "page"
  );

  return links
    .map((link, index) => {
      if (index === currentIndex) {
        return null;
      }
      // Only the immediate neighbours get a key binding; anything further is
      // still reachable from the palette, just without a shortcut.
      let keys;
      if (index === currentIndex - 1) {
        keys = ["h"];
      } else if (index === currentIndex + 1) {
        keys = ["l"];
      }
      return {
        label: `Go to ${link.textContent.trim()}`,
        keywords: "page navigation",
        keys,
        run: () => {
          window.location.href = link.href;
        },
      };
    })
    .filter((command) => command !== null);
}

function main() {
  const animate = !prefersReducedMotion();
  const random = createSeededRandom(randomSeed);

  // --- Instruments --------------------------------------------------------

  const telemetryRoot = document.querySelector(".lab-readout");
  const telemetry = telemetryRoot ? createTelemetryPanel(telemetryRoot) : null;

  const canvas = document.querySelector(".lab-hero__lattice");
  const lattice = canvas
    ? createLatticeField(canvas, {
        random,
        animate,
        // The lattice already runs a frame loop, so it is the cheapest honest
        // source of frame timings for the panel.
        onFrame: (stats) => telemetry?.recordFrame(stats),
      })
    : null;

  const scrambleTarget = document.querySelector(".lab-scramble");
  if (scrambleTarget) {
    createTextScrambler(scrambleTarget, { random, animate });
  }

  createPointerTilt(document.querySelectorAll(".lab-card"), { animate });

  // --- Commands -----------------------------------------------------------

  // Scrolling is animated only when the page is, so the palette never smooth
  // scrolls a reader who has asked for stillness.
  const scrollBehavior = animate ? "smooth" : "auto";

  /**
   * A command that scrolls to one of this page's sections.
   *
   * @param {string} label
   * @param {string} selector
   * @returns {object}
   */
  const sectionCommand = (label, selector) => ({
    label: `Jump to ${label}`,
    keywords: "section scroll",
    run: () => {
      document
        .querySelector(selector)
        ?.scrollIntoView({ behavior: scrollBehavior, block: "start" });
    },
  });

  const commands = [
    ...buildPageCommands(),
    sectionCommand("telemetry", "#telemetry"),
    sectionCommand("subsystems", "#systems"),
    sectionCommand("provenance", "#provenance"),
    {
      label: "Back to top",
      keywords: "scroll start gg",
      keys: ["g", "g"],
      run: () => window.scrollTo({ top: 0, behavior: scrollBehavior }),
    },
  ];

  // Offered only when the lattice is actually animating: under reduced motion
  // there is no loop to pause, and a command that claimed otherwise would be
  // lying about what the page is doing.
  if (lattice && animate) {
    commands.push({
      label: () => (lattice.isRunning() ? "Pause motion" : "Resume motion"),
      keywords: "animation lattice canvas stop start",
      run: () => lattice.toggle(),
    });
  }

  // --- Palette ------------------------------------------------------------

  const dialog = document.querySelector(".palette");
  const input = document.querySelector(".palette__input");
  const list = document.querySelector(".palette__list");
  const emptyMessage = document.querySelector(".palette__empty");

  if (dialog && input && list && emptyMessage) {
    createCommandPalette({
      dialog,
      input,
      list,
      emptyMessage,
      openButton: document.querySelector(".lab-hero__command"),
      commands,
    });
  }
}

main();
