(() => {
  const WORKSPACE_ID = "map-grid";
  const CARD_SELECTOR = ".map-card";
  const MIN_WIDTH = 360;
  const MIN_HEIGHT = 360;
  const GAP = 14;
  const DEFAULT_HEIGHT = 540;

  let nextWindowNumber = 1;
  let topZ = 100;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function getWorkspace() {
    return document.getElementById(WORKSPACE_ID);
  }

  function bringToFront(card) {
    topZ += 1;
    card.style.zIndex = String(topZ);
  }

  function updateWorkspaceHeight() {
    const workspace = getWorkspace();
    if (!workspace) return;

    let bottom = 0;

    workspace.querySelectorAll(CARD_SELECTOR).forEach((card) => {
      const cardBottom = card.offsetTop + card.offsetHeight;
      bottom = Math.max(bottom, cardBottom);
    });

    workspace.style.minHeight = `${Math.max(650, bottom + GAP)}px`;
  }

  function scheduleMapRefresh() {
    // Current Google Maps builds generally react to container resizing.
    // Dispatching a window resize event gives the map another nudge after
    // a panel is resized without needing access to the private map instance.
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
    });
  }

  function defaultGeometry(index) {
    const workspace = getWorkspace();
    const availableWidth = Math.max(workspace.clientWidth, 760);

    const twoColumns = availableWidth >= 900;
    const columns = twoColumns ? 2 : 1;

    const width = twoColumns
      ? Math.max(
          MIN_WIDTH,
          Math.floor((availableWidth - GAP * 3) / 2)
        )
      : Math.max(
          MIN_WIDTH,
          Math.min(760, availableWidth - GAP * 2)
        );

    const column = index % columns;
    const row = Math.floor(index / columns);

    return {
      left: GAP + column * (width + GAP),
      top: GAP + row * (DEFAULT_HEIGHT + GAP),
      width,
      height: DEFAULT_HEIGHT
    };
  }

  function setGeometry(card, geometry) {
    card.style.left = `${Math.round(geometry.left)}px`;
    card.style.top = `${Math.round(geometry.top)}px`;
    card.style.width = `${Math.round(geometry.width)}px`;
    card.style.height = `${Math.round(geometry.height)}px`;
  }

  function addDragBar(card, number) {
    const dragBar = document.createElement("div");
    dragBar.className = "window-drag-bar";
    dragBar.setAttribute("aria-label", `Drag map ${number}`);

    const grip = document.createElement("span");
    grip.className = "window-grip";
    grip.textContent = "⠿";

    const title = document.createElement("span");
    title.className = "window-title";
    title.textContent = `Map ${number}`;

    const hint = document.createElement("span");
    hint.className = "window-drag-hint";
    hint.textContent = "drag";

    dragBar.append(grip, title, hint);
    card.insertBefore(dragBar, card.firstChild);

    dragBar.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;

      event.preventDefault();
      bringToFront(card);

      const workspace = getWorkspace();
      const startX = event.clientX;
      const startY = event.clientY;
      const startLeft = card.offsetLeft;
      const startTop = card.offsetTop;

      dragBar.classList.add("is-dragging");
      dragBar.setPointerCapture(event.pointerId);

      const onMove = (moveEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;

        const maxLeft = Math.max(
          0,
          workspace.clientWidth - card.offsetWidth
        );

        const left = clamp(startLeft + dx, 0, maxLeft);
        const top = Math.max(0, startTop + dy);

        card.style.left = `${Math.round(left)}px`;
        card.style.top = `${Math.round(top)}px`;

        updateWorkspaceHeight();
      };

      const onEnd = (endEvent) => {
        dragBar.classList.remove("is-dragging");

        try {
          dragBar.releasePointerCapture(endEvent.pointerId);
        } catch (_) {}

        dragBar.removeEventListener("pointermove", onMove);
        dragBar.removeEventListener("pointerup", onEnd);
        dragBar.removeEventListener("pointercancel", onEnd);

        updateWorkspaceHeight();
      };

      dragBar.addEventListener("pointermove", onMove);
      dragBar.addEventListener("pointerup", onEnd);
      dragBar.addEventListener("pointercancel", onEnd);
    });
  }

  function addResizeHandles(card) {
    const directions = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

    directions.forEach((direction) => {
      const handle = document.createElement("div");
      handle.className = `window-resize-handle resize-${direction}`;
      handle.dataset.direction = direction;
      handle.setAttribute("aria-hidden", "true");
      card.appendChild(handle);

      handle.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;

        event.preventDefault();
        event.stopPropagation();
        bringToFront(card);

        const workspace = getWorkspace();

        const startX = event.clientX;
        const startY = event.clientY;
        const startLeft = card.offsetLeft;
        const startTop = card.offsetTop;
        const startWidth = card.offsetWidth;
        const startHeight = card.offsetHeight;

        handle.classList.add("is-resizing");
        card.classList.add("window-is-resizing");
        handle.setPointerCapture(event.pointerId);

        const onMove = (moveEvent) => {
          const dx = moveEvent.clientX - startX;
          const dy = moveEvent.clientY - startY;

          let left = startLeft;
          let top = startTop;
          let width = startWidth;
          let height = startHeight;

          const hasE = direction.includes("e");
          const hasW = direction.includes("w");
          const hasN = direction.includes("n");
          const hasS = direction.includes("s");

          if (hasE) {
            width = Math.max(MIN_WIDTH, startWidth + dx);
          }

          if (hasS) {
            height = Math.max(MIN_HEIGHT, startHeight + dy);
          }

          if (hasW) {
            const proposedWidth = startWidth - dx;

            if (proposedWidth >= MIN_WIDTH) {
              width = proposedWidth;
              left = startLeft + dx;
            }

            if (left < 0) {
              width += left;
              left = 0;
            }
          }

          if (hasN) {
            const proposedHeight = startHeight - dy;

            if (proposedHeight >= MIN_HEIGHT) {
              height = proposedHeight;
              top = startTop + dy;
            }

            if (top < 0) {
              height += top;
              top = 0;
            }
          }

          // Keep the right edge inside the visible workspace width.
          const maxWidth = workspace.clientWidth - left;

          if (width > maxWidth) {
            width = Math.max(MIN_WIDTH, maxWidth);
          }

          setGeometry(card, {
            left,
            top,
            width,
            height
          });

          updateWorkspaceHeight();
          scheduleMapRefresh();
        };

        const onEnd = (endEvent) => {
          handle.classList.remove("is-resizing");
          card.classList.remove("window-is-resizing");

          try {
            handle.releasePointerCapture(endEvent.pointerId);
          } catch (_) {}

          handle.removeEventListener("pointermove", onMove);
          handle.removeEventListener("pointerup", onEnd);
          handle.removeEventListener("pointercancel", onEnd);

          updateWorkspaceHeight();
          scheduleMapRefresh();
        };

        handle.addEventListener("pointermove", onMove);
        handle.addEventListener("pointerup", onEnd);
        handle.addEventListener("pointercancel", onEnd);
      });
    });
  }

  function wireCard(card) {
    if (!card || card.dataset.windowWorkspaceReady === "true") return;

    card.dataset.windowWorkspaceReady = "true";

    const windowNumber = nextWindowNumber++;
    card.dataset.windowNumber = String(windowNumber);

    const workspace = getWorkspace();
    const existingWiredCards = workspace.querySelectorAll(
      `${CARD_SELECTOR}[data-window-workspace-ready="true"]`
    );

    const index = Math.max(0, existingWiredCards.length - 1);
    setGeometry(card, defaultGeometry(index));

    card.classList.add("floating-map-window");

    addDragBar(card, windowNumber);
    addResizeHandles(card);

    card.addEventListener("pointerdown", () => {
      bringToFront(card);
    });

    bringToFront(card);

    const shell = card.querySelector(".map-shell");

    if (shell && "ResizeObserver" in window) {
      let frame = null;

      const observer = new ResizeObserver(() => {
        if (frame) cancelAnimationFrame(frame);

        frame = requestAnimationFrame(() => {
          scheduleMapRefresh();
        });
      });

      observer.observe(shell);
    }

    updateWorkspaceHeight();
  }

  function arrangeWindows() {
    const workspace = getWorkspace();
    if (!workspace) return;

    const cards = Array.from(
      workspace.querySelectorAll(CARD_SELECTOR)
    );

    cards.forEach((card, index) => {
      setGeometry(card, defaultGeometry(index));
      bringToFront(card);
    });

    updateWorkspaceHeight();
    scheduleMapRefresh();
  }

  function installArrangeButton() {
    const controls = document.querySelector(".controls");

    if (!controls || document.getElementById("arrange-windows")) return;

    const button = document.createElement("button");
    button.id = "arrange-windows";
    button.type = "button";
    button.textContent = "Tidy map windows";
    button.title = "Return all map windows to an even layout";

    button.addEventListener("click", arrangeWindows);

    controls.appendChild(button);
  }

  function installWorkspace() {
    const workspace = getWorkspace();
    if (!workspace) return;

    workspace.classList.add("floating-map-workspace");
    installArrangeButton();

    workspace.querySelectorAll(CARD_SELECTOR).forEach(wireCard);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;

          if (node.matches && node.matches(CARD_SELECTOR)) {
            wireCard(node);
          }

          node.querySelectorAll?.(CARD_SELECTOR).forEach(wireCard);
        }
      }
    });

    observer.observe(workspace, {
      childList: true,
      subtree: false
    });

    window.addEventListener("resize", () => {
      const cards = workspace.querySelectorAll(CARD_SELECTOR);

      cards.forEach((card) => {
        const maxLeft = Math.max(
          0,
          workspace.clientWidth - card.offsetWidth
        );

        if (card.offsetLeft > maxLeft) {
          card.style.left = `${maxLeft}px`;
        }

        if (card.offsetWidth > workspace.clientWidth) {
          card.style.width = `${Math.max(
            MIN_WIDTH,
            workspace.clientWidth
          )}px`;
          card.style.left = "0px";
        }
      });

      updateWorkspaceHeight();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installWorkspace);
  } else {
    installWorkspace();
  }
})();
