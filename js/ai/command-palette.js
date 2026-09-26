/**
 * Command palette — the Ctrl+K dialog, and the page's keyboard surface.
 *
 * Two things live here because they are the same idea seen from two angles: a
 * command is something you can run from a searchable list, and some commands
 * are also bound to a key sequence you can type directly. Defining them once
 * means the list can never drift out of step with the shortcuts it documents.
 *
 * The dialog itself is a native `<dialog>` opened with `showModal`, so focus
 * trapping, the inert background, the backdrop and Escape-to-dismiss are the
 * platform's job rather than several hundred lines of this file's.
 *
 * Key sequences are matched against a short rolling buffer, which is what lets
 * a multi-key motion such as `gg` sit alongside single keys like `h` without
 * either being special-cased.
 */

/** How long a partial key sequence stays live. Long enough for a deliberate
 *  two-key motion, short enough that an unrelated later keystroke does not
 *  complete one by accident. */
const sequenceResetMilliseconds = 700;

/**
 * Whether the event came from somewhere text is being entered, in which case
 * single-key shortcuts must not fire.
 *
 * @param {KeyboardEvent} event
 * @returns {boolean}
 */
function isTyping(event) {
  return Boolean(
    event.target.closest("input, textarea, select, [contenteditable]")
  );
}

/**
 * Resolve a command's label, which may be a function so that a command can
 * describe its own current state (pause versus resume, for instance).
 *
 * @param {object} command
 * @returns {string}
 */
function labelOf(command) {
  return typeof command.label === "function" ? command.label() : command.label;
}

/**
 * Build the palette and bind the page's keyboard shortcuts.
 *
 * @param {object} options
 * @param {HTMLDialogElement} options.dialog
 * @param {HTMLInputElement} options.input Filter field inside the dialog.
 * @param {HTMLElement} options.list The `<ul>` the options are rendered into.
 * @param {HTMLElement} options.emptyMessage Shown when nothing matches.
 * @param {HTMLElement} [options.openButton] Visible trigger for the dialog.
 * @param {Array<object>} options.commands The command registry.
 * @returns {{open: () => void, close: () => void}}
 */
export function createCommandPalette({
  dialog,
  input,
  list,
  emptyMessage,
  openButton,
  commands,
}) {
  /** Commands currently passing the filter, in display order. */
  let matches = [];
  /** Index into `matches` of the highlighted row. */
  let activeIndex = 0;

  let recentKeys = [];
  let lastKeyMilliseconds = 0;
  const longestSequenceLength = commands.reduce(
    (longest, command) => Math.max(longest, command.keys?.length ?? 0),
    0
  );

  /**
   * Move the highlight, keeping it inside the list and scrolled into view.
   *
   * @param {number} index Clamped, so callers can pass out-of-range values.
   */
  function setActiveIndex(index) {
    if (matches.length === 0) {
      return;
    }
    activeIndex = Math.max(0, Math.min(index, matches.length - 1));
    const options = list.querySelectorAll(".palette__option");
    options.forEach((option, optionIndex) => {
      option.classList.toggle("is-active", optionIndex === activeIndex);
    });
    options[activeIndex]?.scrollIntoView({ block: "nearest" });
  }

  /**
   * Render one row.
   *
   * A real `<button>` inside the list item, so the row is focusable, clickable
   * and announced correctly without any ARIA patched on top of a `<div>`.
   *
   * @param {object} command
   * @param {number} index
   * @returns {HTMLLIElement}
   */
  function buildOption(command, index) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "palette__option";

    const label = document.createElement("span");
    label.textContent = labelOf(command);
    button.append(label);

    if (command.keys) {
      const hint = document.createElement("span");
      hint.className = "palette__option-hint";
      hint.textContent = command.keys.join(" ");
      button.append(hint);
    }

    // Pointer, rather than click, so moving over a row with the mouse and
    // moving through it with the arrow keys agree on what is selected.
    button.addEventListener("pointerenter", () => setActiveIndex(index));
    button.addEventListener("click", () => runCommand(command));

    item.append(button);
    return item;
  }

  /**
   * Filter the registry and repaint the list.
   *
   * @param {string} query Raw text from the filter field.
   */
  function render(query) {
    const needle = query.trim().toLowerCase();
    matches = commands.filter((command) => {
      if (needle === "") {
        return true;
      }
      const haystack = `${labelOf(command)} ${command.keywords ?? ""}`;
      return haystack.toLowerCase().includes(needle);
    });

    list.replaceChildren(...matches.map(buildOption));
    emptyMessage.hidden = matches.length > 0;
    setActiveIndex(0);
  }

  /**
   * Close the dialog, then run the command.
   *
   * Closing first means a command that navigates away is not racing a dialog
   * teardown, and one that scrolls is not scrolling behind a modal backdrop.
   *
   * @param {object} command
   */
  function runCommand(command) {
    if (dialog.open) {
      dialog.close();
    }
    command.run();
  }

  function open() {
    input.value = "";
    render("");
    dialog.showModal();
    input.focus();
  }

  function close() {
    dialog.close();
  }

  /**
   * Match a typed key against the registry's sequences.
   *
   * @param {string} key
   * @returns {boolean} True when a command ran, so the caller can stop.
   */
  function handleKeySequence(key) {
    const now = Date.now();
    if (now - lastKeyMilliseconds > sequenceResetMilliseconds) {
      recentKeys = [];
    }
    lastKeyMilliseconds = now;

    recentKeys.push(key);
    if (recentKeys.length > longestSequenceLength) {
      recentKeys.shift();
    }

    const matched = commands.find((command) => {
      if (!command.keys) {
        return false;
      }
      // The buffer holds the last few keys, so a sequence matches when it is
      // a suffix of what was just typed.
      const tail = recentKeys.slice(-command.keys.length);
      return (
        tail.length === command.keys.length &&
        tail.every((typed, index) => typed === command.keys[index])
      );
    });

    if (matched) {
      recentKeys = [];
      matched.run();
      return true;
    }
    return false;
  }

  openButton?.addEventListener("click", open);
  input.addEventListener("input", () => render(input.value));

  // Bound to the dialog rather than the input so the arrow keys still work
  // after the Close button has taken focus.
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex(activeIndex + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(activeIndex - 1);
    } else if (event.key === "Enter" && matches[activeIndex]) {
      event.preventDefault();
      runCommand(matches[activeIndex]);
    }
  });

  document.addEventListener("keydown", (event) => {
    // Ctrl+K, or Cmd+K on a Mac. Preventing the default keeps it away from
    // the browser's own search bar binding.
    if (event.key === "k" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      if (dialog.open) {
        close();
      } else {
        open();
      }
      return;
    }

    // Everything below is a bare key, so any modifier means the keystroke
    // belongs to the browser or the operating system.
    if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event)) {
      return;
    }

    // While the dialog is open its own handler owns the keyboard.
    if (dialog.open) {
      return;
    }

    handleKeySequence(event.key);
  });

  return { open, close };
}
