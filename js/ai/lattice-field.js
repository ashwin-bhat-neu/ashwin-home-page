/**
 * Lattice field — the animated trapezoid grid behind the Lab hero.
 *
 * The site's visual language is trapezoids and hard lines, so the background
 * is built from the same shape rather than the particle swarm these pages
 * usually get. Every cell is one trapezoid; a travelling sine wave pinches
 * and releases its top edge, and cells near the pointer are drawn brighter.
 *
 * The module owns nothing outside the canvas it is handed, and it reports
 * frame timings outward through a callback so the telemetry panel can display
 * real numbers rather than invented ones.
 */

// --- Tuning ----------------------------------------------------------------

/** Edge length of one cell, in CSS pixels. At 78 a 1280px hero shows ~16
 *  columns, which reads as a lattice rather than as wallpaper. */
const cellSizePixels = 78;

/** Rendering above 2x costs real frame time and is invisible on the displays
 *  this is likely to be read on, so the backing store is capped there. */
const maxDevicePixelRatio = 2;

/** Wave speed and shape. The two per-pixel terms are deliberately different so
 *  the crest travels diagonally instead of marching straight down the grid. */
const waveRadiansPerMillisecond = 0.0009;
const waveRadiansPerPixelX = 0.018;
const waveRadiansPerPixelY = 0.026;

/** How far the top edge may pinch inward, as a fraction of the cell. Past
 *  about 0.4 the shape stops reading as a trapezoid and becomes a triangle. */
const topEdgeInsetRatio = 0.34;

/** Radius of the pointer's influence, and the stroke alphas it interpolates
 *  between. The resting value is deliberately low: the field is a background. */
const pointerReachPixels = 240;
const restingStrokeAlpha = 0.14;
const pointerStrokeAlpha = 0.6;

/** Cells this close to the pointer also get a faint fill. */
const fillProximityThreshold = 0.55;
const pointerFillAlpha = 0.07;

/** --color-sage from base.css, as channels, so alpha can vary per cell. */
const sageChannels = "142, 153, 139";

/** Weight of each new sample in the frame-time average. Low enough that the
 *  readout settles instead of flickering between two numbers. */
const frameTimeSmoothing = 0.1;

/**
 * Build a lattice field over a canvas.
 *
 * @param {HTMLCanvasElement} canvas The canvas to draw into.
 * @param {object} options
 * @param {() => number} options.random Seeded generator for per-cell phase.
 * @param {boolean} options.animate False to draw one still frame and stop.
 * @param {(stats: {frameMilliseconds: number, cellCount: number}) => void}
 *   [options.onFrame] Called once per rendered frame with live timings.
 * @returns {{start: () => void, stop: () => void, toggle: () => boolean,
 *   isRunning: () => boolean, getCellCount: () => number} | null}
 *   Null when the 2D context is unavailable, so callers can degrade quietly.
 */
export function createLatticeField(canvas, { random, animate, onFrame }) {
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  let cells = [];
  let widthPixels = 0;
  let heightPixels = 0;
  let pointer = null;
  let animationHandle = 0;
  let running = false;
  let lastTimestampMilliseconds = 0;
  let smoothedFrameMilliseconds = 0;

  /**
   * Resize the backing store to the element's box and rebuild the geometry.
   *
   * The canvas is scaled by the device pixel ratio and the context is then
   * scaled back by the same factor, so every coordinate below this line can be
   * written in plain CSS pixels.
   */
  function measure() {
    const ratio = Math.min(window.devicePixelRatio || 1, maxDevicePixelRatio);
    widthPixels = canvas.clientWidth;
    heightPixels = canvas.clientHeight;

    // A hidden or zero-height canvas would produce an empty lattice and a
    // divide-by-zero in the column count, so bail out until it has a box.
    if (widthPixels === 0 || heightPixels === 0) {
      cells = [];
      return;
    }

    canvas.width = Math.round(widthPixels * ratio);
    canvas.height = Math.round(heightPixels * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    // One extra column and row so the field bleeds past the edges instead of
    // stopping short of them when the size is not an exact multiple.
    const columnCount = Math.ceil(widthPixels / cellSizePixels) + 1;
    const rowCount = Math.ceil(heightPixels / cellSizePixels) + 1;

    cells = [];
    for (let row = 0; row < rowCount; row += 1) {
      for (let column = 0; column < columnCount; column += 1) {
        cells.push({
          left: column * cellSizePixels,
          top: row * cellSizePixels,
          // A fixed random phase per cell breaks up the regularity of the
          // wave without moving any cell off the grid.
          phaseRadians: random() * Math.PI * 2,
        });
      }
    }
  }

  /**
   * Draw one frame of the field.
   *
   * @param {number} timeMilliseconds Timestamp driving the wave.
   */
  function drawFrame(timeMilliseconds) {
    context.clearRect(0, 0, widthPixels, heightPixels);
    context.lineWidth = 1;

    for (const cell of cells) {
      const wave = Math.sin(
        cell.left * waveRadiansPerPixelX +
          cell.top * waveRadiansPerPixelY +
          timeMilliseconds * waveRadiansPerMillisecond +
          cell.phaseRadians
      );

      // Map the wave from [-1, 1] onto the inset range.
      const insetPixels = ((wave + 1) / 2) * cellSizePixels * topEdgeInsetRatio;

      // Falls from 1 at the pointer to 0 at the edge of its reach.
      let proximity = 0;
      if (pointer) {
        const distanceX = pointer.x - (cell.left + cellSizePixels / 2);
        const distanceY = pointer.y - (cell.top + cellSizePixels / 2);
        const distance = Math.hypot(distanceX, distanceY);
        proximity = Math.max(0, 1 - distance / pointerReachPixels);
      }

      context.beginPath();
      context.moveTo(cell.left + insetPixels, cell.top);
      context.lineTo(cell.left + cellSizePixels - insetPixels, cell.top);
      context.lineTo(cell.left + cellSizePixels, cell.top + cellSizePixels);
      context.lineTo(cell.left, cell.top + cellSizePixels);
      context.closePath();

      if (proximity > fillProximityThreshold) {
        const fillAlpha = pointerFillAlpha * proximity;
        context.fillStyle = `rgba(${sageChannels}, ${fillAlpha})`;
        context.fill();
      }

      const strokeAlpha =
        restingStrokeAlpha +
        proximity * (pointerStrokeAlpha - restingStrokeAlpha);
      context.strokeStyle = `rgba(${sageChannels}, ${strokeAlpha})`;
      context.stroke();
    }
  }

  /**
   * The animation loop. Timings are smoothed before being reported so the
   * telemetry readout shows a settled number rather than per-frame jitter.
   *
   * @param {number} timestampMilliseconds Supplied by requestAnimationFrame.
   */
  function loop(timestampMilliseconds) {
    if (lastTimestampMilliseconds !== 0) {
      const deltaMilliseconds =
        timestampMilliseconds - lastTimestampMilliseconds;
      smoothedFrameMilliseconds =
        smoothedFrameMilliseconds === 0
          ? deltaMilliseconds
          : smoothedFrameMilliseconds +
            (deltaMilliseconds - smoothedFrameMilliseconds) *
              frameTimeSmoothing;
      onFrame?.({
        frameMilliseconds: smoothedFrameMilliseconds,
        cellCount: cells.length,
      });
    }
    lastTimestampMilliseconds = timestampMilliseconds;

    drawFrame(timestampMilliseconds);
    animationHandle = window.requestAnimationFrame(loop);
  }

  function start() {
    if (running || cells.length === 0) {
      return;
    }
    running = true;
    // Reset the clock so a long pause is not reported as one enormous frame.
    lastTimestampMilliseconds = 0;
    animationHandle = window.requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    window.cancelAnimationFrame(animationHandle);
  }

  // Resize rather than window resize, so the field also reacts to the hero
  // changing height when text wraps at a new width.
  const resizeObserver = new ResizeObserver(() => {
    measure();
    if (!running) {
      drawFrame(lastTimestampMilliseconds);
    }
  });
  resizeObserver.observe(canvas);

  // Pointer position is stored in canvas-local CSS pixels, which is the same
  // space the cell geometry is built in.
  window.addEventListener("pointermove", (event) => {
    const bounds = canvas.getBoundingClientRect();
    pointer = {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    };
  });

  // Dropping the pointer on leave lets the field settle back to its resting
  // brightness instead of freezing with a bright patch wherever it left.
  document.addEventListener("pointerleave", () => {
    pointer = null;
  });

  // A hidden tab still fires animation frames in some browsers; stopping is
  // both cheaper and keeps the reported frame time honest.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stop();
    } else if (animate) {
      start();
    }
  });

  measure();

  if (animate) {
    start();
  } else {
    // Reduced motion: one still frame, and one report so the telemetry panel
    // can still show how many cells were built.
    drawFrame(0);
    onFrame?.({ frameMilliseconds: 0, cellCount: cells.length });
  }

  return {
    start,
    stop,
    /** @returns {boolean} The running state after toggling. */
    toggle() {
      if (running) {
        stop();
      } else {
        start();
      }
      return running;
    },
    isRunning: () => running,
    getCellCount: () => cells.length,
  };
}
