/**
 * Telemetry panel — fills the instrument grid with live values.
 *
 * Every field here is measured from the running tab. Nothing is fabricated to
 * look busy: where a value genuinely is not available, the em dash that ships
 * in the markup is left in place, and the pointer reads "idle" until it has
 * actually moved. A panel of invented numbers would be decoration pretending
 * to be instrumentation.
 */

/** Refresh rate of the readout. Four times a second is fast enough to feel
 *  live and slow enough that the digits can be read. */
const updateIntervalMilliseconds = 250;

/** Frame times below this are treated as no reading at all, which is what a
 *  paused or reduced-motion lattice reports. */
const minimumMeaningfulFrameMilliseconds = 0.001;

const millisecondsPerSecond = 1000;
const secondsPerMinute = 60;

/**
 * Format elapsed milliseconds as m:ss.
 *
 * @param {number} elapsedMilliseconds
 * @returns {string}
 */
function formatDuration(elapsedMilliseconds) {
  const totalSeconds = Math.floor(elapsedMilliseconds / millisecondsPerSecond);
  const minutes = Math.floor(totalSeconds / secondsPerMinute);
  const seconds = totalSeconds % secondsPerMinute;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Wire up the telemetry panel.
 *
 * @param {HTMLElement} root Container holding the `data-readout` elements.
 * @returns {{recordFrame: (stats: {frameMilliseconds: number,
 *   cellCount: number}) => void, stop: () => void}}
 *   `recordFrame` is handed to the lattice so its loop can push timings in.
 */
export function createTelemetryPanel(root) {
  // Indexed once at startup: the panel is static, so re-querying on every
  // update would be four wasted DOM searches a second.
  const valueElements = new Map();
  for (const element of root.querySelectorAll("[data-readout]")) {
    valueElements.set(element.dataset.readout, element);
  }

  const startedAtMilliseconds = performance.now();
  let frameMilliseconds = 0;
  let cellCount = 0;
  let pointerPosition = null;

  /**
   * Write a value, if that field exists in the markup.
   *
   * @param {string} name The `data-readout` key.
   * @param {string} value
   */
  function write(name, value) {
    const element = valueElements.get(name);
    if (element) {
      element.textContent = value;
    }
  }

  function render() {
    const hasFrameReading =
      frameMilliseconds > minimumMeaningfulFrameMilliseconds;

    write(
      "frameRate",
      hasFrameReading
        ? `${Math.round(millisecondsPerSecond / frameMilliseconds)} fps`
        : "paused"
    );
    write(
      "frameTime",
      hasFrameReading ? `${frameMilliseconds.toFixed(1)} ms` : "paused"
    );
    write("cellCount", String(cellCount));
    write(
      "pointer",
      pointerPosition ? `${pointerPosition.x}, ${pointerPosition.y}` : "idle"
    );
    write("viewport", `${window.innerWidth} x ${window.innerHeight}`);
    write("uptime", formatDuration(performance.now() - startedAtMilliseconds));
  }

  window.addEventListener("pointermove", (event) => {
    pointerPosition = {
      x: Math.round(event.clientX),
      y: Math.round(event.clientY),
    };
  });

  const timerId = window.setInterval(render, updateIntervalMilliseconds);
  render();

  return {
    recordFrame(stats) {
      frameMilliseconds = stats.frameMilliseconds;
      cellCount = stats.cellCount;
    },
    stop() {
      window.clearInterval(timerId);
    },
  };
}
