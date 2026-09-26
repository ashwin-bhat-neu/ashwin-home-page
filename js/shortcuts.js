const doubleTapMilliseconds = 500;

function isTyping(event) {
  return event.target.closest("input, textarea, select, [contenteditable]");
}

export function setupShortcuts() {
  const dialog = document.querySelector(".shortcut-dialog");
  const openButton = document.querySelector(".shortcut-button");
  const pageLinks = Array.from(document.querySelectorAll(".site-nav__link"));
  const currentPage = pageLinks.findIndex(
    (link) => link.getAttribute("aria-current") === "page"
  );

  if (!dialog || !openButton) {
    return;
  }

  let lastKey = "";
  let lastKeyTime = 0;

  function goToPage(offset) {
    const link = pageLinks[currentPage + offset];
    if (link) {
      window.location.href = link.href;
    }
  }

  function toggleDialog() {
    if (dialog.open) {
      dialog.close();
    } else {
      dialog.showModal();
    }
  }

  openButton.addEventListener("click", () => dialog.showModal());

  document.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event)) {
      return;
    }

    if (event.key === "?") {
      event.preventDefault();
      toggleDialog();
      return;
    }

    if (dialog.open) {
      return;
    }

    const now = Date.now();
    const isDoubleG =
      event.key === "g" &&
      lastKey === "g" &&
      now - lastKeyTime < doubleTapMilliseconds;
    lastKey = isDoubleG ? "" : event.key;
    lastKeyTime = now;

    if (event.key === "h") {
      goToPage(-1);
    } else if (event.key === "l") {
      goToPage(1);
    } else if (isDoubleG) {
      window.scrollTo({ top: 0 });
    }
  });
}
