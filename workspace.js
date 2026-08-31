(() => {
  const WORKSPACE_ID = "map-grid";
  const CARD_SELECTOR = ".map-card";

  // Horizontal sizing uses fine grid units so width changes are close
  // to the vertical resize rhythm. A normal tile starts 6 units wide.
  // Depending on browser width, one horizontal step is usually ~55–65 px.
  const MIN_COLUMN_WIDTH = 45;
  const MAX_COLUMNS = 30;
  const GRID_GAP = 12;

  const DEFAULT_COL_SPAN = 6;
  const DEFAULT_ROW_SPAN = 7;

  const MIN_ROW_SPAN = 5;
  const MAX_ROW_SPAN = 16;

  let nextTileNumber = 1;
  let resizeDebounce = null;

  function getWorkspace() {
    return document.getElementById(WORKSPACE_ID);
  }

  function getCards() {
    const workspace = getWorkspace();
    return workspace
      ? Array.from(workspace.querySelectorAll(CARD_SELECTOR))
      : [];
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function calculateColumnCount() {
    const workspace = getWorkspace();
    if (!workspace) return 1;

    const width = workspace.clientWidth || window.innerWidth;

    return clamp(
      Math.floor((width + GRID_GAP) / (MIN_COLUMN_WIDTH + GRID_GAP)),
      1,
      MAX_COLUMNS
    );
  }

  function syncColumnCount() {
    const workspace = getWorkspace();
    if (!workspace) return;

    const columns = calculateColumnCount();
    workspace.style.setProperty("--workspace-columns", String(columns));

    getCards().forEach((card) => {
      const currentCols = getColSpan(card);
      if (currentCols > columns) {
        setSpans(card, columns, getRowSpan(card));
      }
    });
  }

  function getColumnCount() {
    const workspace = getWorkspace();
    if (!workspace) return 1;

    return Number(
      getComputedStyle(workspace)
        .getPropertyValue("--workspace-columns")
        .trim()
    ) || calculateColumnCount();
  }

  function getColSpan(card) {
    return Number(card.dataset.colSpan) || DEFAULT_COL_SPAN;
  }

  function getRowSpan(card) {
    return Number(card.dataset.rowSpan) || DEFAULT_ROW_SPAN;
  }

  function setSpans(card, colSpan, rowSpan) {
    const columns = getColumnCount();

    const safeCols = clamp(Math.round(colSpan), 1, columns);
    const safeRows = clamp(
      Math.round(rowSpan),
      MIN_ROW_SPAN,
      MAX_ROW_SPAN
    );

    card.dataset.colSpan = String(safeCols);
    card.dataset.rowSpan = String(safeRows);

    card.style.setProperty("--tile-cols", safeCols);
    card.style.setProperty("--tile-rows", safeRows);

    updateSizeBadge(card);
  }

  function updateSizeBadge(card) {
    const badge = card.querySelector(".tile-size-badge");
    if (!badge) return;

    badge.textContent = `${getColSpan(card)}×${getRowSpan(card)}`;
  }

  function notifyMapResize() {
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
    });
  }

  function gridMeasurements() {
    const workspace = getWorkspace();
    const computed = getComputedStyle(workspace);

    const columns = getColumnCount();
    const totalGap = GRID_GAP * Math.max(0, columns - 1);

    const columnWidth =
      (workspace.clientWidth - totalGap) / columns;

    const rowHeight =
      parseFloat(computed.getPropertyValue("--grid-row-height")) || 56;

    return {
      columnUnit: columnWidth + GRID_GAP,
      rowUnit: rowHeight + GRID_GAP
    };
  }

  function clearDropTargets() {
    getCards().forEach((card) => {
      card.classList.remove("tile-drop-target");
    });
  }

  function addDragBar(card, tileNumber) {
    const bar = document.createElement("div");
    bar.className = "tile-drag-bar";

    const grip = document.createElement("span");
    grip.className = "tile-grip";
    grip.textContent = "⠿";

    const title = document.createElement("span");
    title.className = "tile-title";
    title.textContent = `Map ${tileNumber}`;

    const badge = document.createElement("span");
    badge.className = "tile-size-badge";
    badge.title = "Grid width × height";

    const hint = document.createElement("span");
    hint.className = "tile-drag-hint";
    hint.textContent = "drag to reorder";

    bar.append(grip, title, badge, hint);
    card.insertBefore(bar, card.firstChild);

    bar.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;

      event.preventDefault();
      event.stopPropagation();

      card.classList.add("tile-is-dragging");

      const onMove = (moveEvent) => {
        clearDropTargets();

        const candidates = getCards().filter(
          (candidate) => candidate !== card
        );

        const underPointer = candidates.find((candidate) => {
          const rect = candidate.getBoundingClientRect();

          return (
            moveEvent.clientX >= rect.left &&
            moveEvent.clientX <= rect.right &&
            moveEvent.clientY >= rect.top &&
            moveEvent.clientY <= rect.bottom
          );
        });

        if (!underPointer) return;

        underPointer.classList.add("tile-drop-target");

        const rect = underPointer.getBoundingClientRect();
        const pointerIsBefore =
          moveEvent.clientY < rect.top + rect.height / 2;

        const workspace = getWorkspace();

        if (pointerIsBefore) {
          workspace.insertBefore(card, underPointer);
        } else {
          workspace.insertBefore(card, underPointer.nextSibling);
        }

        notifyMapResize();
      };

      const onEnd = () => {
        card.classList.remove("tile-is-dragging");
        clearDropTargets();

        document.removeEventListener("pointermove", onMove, true);
        document.removeEventListener("pointerup", onEnd, true);
        document.removeEventListener("pointercancel", onEnd, true);

        notifyMapResize();
      };

      document.addEventListener("pointermove", onMove, true);
      document.addEventListener("pointerup", onEnd, true);
      document.addEventListener("pointercancel", onEnd, true);
    });
  }

  function addResizeHandles(card) {
    const directions = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

    directions.forEach((direction) => {
      const handle = document.createElement("div");

      handle.className =
        `tile-resize-handle tile-resize-${direction}`;

      handle.dataset.direction = direction;
      handle.setAttribute("aria-hidden", "true");

      card.appendChild(handle);

      handle.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        const startX = event.clientX;
        const startY = event.clientY;

        const startCols = getColSpan(card);
        const startRows = getRowSpan(card);

        const { columnUnit, rowUnit } = gridMeasurements();

        card.classList.add("tile-is-resizing");
        handle.classList.add("active-resize-handle");

        const onMove = (moveEvent) => {
          moveEvent.preventDefault();
          moveEvent.stopPropagation();

          const dx = moveEvent.clientX - startX;
          const dy = moveEvent.clientY - startY;

          let horizontalDelta = 0;
          let verticalDelta = 0;

          if (direction.includes("e")) {
            horizontalDelta = Math.round(dx / columnUnit);
          }

          if (direction.includes("w")) {
            horizontalDelta = Math.round(-dx / columnUnit);
          }

          if (direction.includes("s")) {
            verticalDelta = Math.round(dy / rowUnit);
          }

          if (direction.includes("n")) {
            verticalDelta = Math.round(-dy / rowUnit);
          }

          setSpans(
            card,
            startCols + horizontalDelta,
            startRows + verticalDelta
          );
        };

        const onEnd = () => {
          card.classList.remove("tile-is-resizing");
          handle.classList.remove("active-resize-handle");

          document.removeEventListener("pointermove", onMove, true);
          document.removeEventListener("pointerup", onEnd, true);
          document.removeEventListener("pointercancel", onEnd, true);

          notifyMapResize();
        };

        document.addEventListener("pointermove", onMove, true);
        document.addEventListener("pointerup", onEnd, true);
        document.addEventListener("pointercancel", onEnd, true);
      });
    });
  }

  function wireCard(card) {
    if (!card || card.dataset.smartTileV2Ready === "true") return;

    card.querySelectorAll(
      ".window-drag-bar, .window-resize-handle, .tile-drag-bar, .tile-resize-handle"
    ).forEach((element) => element.remove());

    card.dataset.smartTileV2Ready = "true";
    card.classList.add("smart-map-tile");

    const tileNumber = nextTileNumber++;
    card.dataset.tileNumber = String(tileNumber);

    setSpans(card, DEFAULT_COL_SPAN, DEFAULT_ROW_SPAN);

    addDragBar(card, tileNumber);
    addResizeHandles(card);
  }

  function resetTiles() {
    syncColumnCount();

    getCards().forEach((card) => {
      setSpans(card, DEFAULT_COL_SPAN, DEFAULT_ROW_SPAN);
    });

    notifyMapResize();
  }

  function makeTilesLarger() {
    syncColumnCount();

    const columns = getColumnCount();
    const preferredWidth = Math.min(
      columns,
      DEFAULT_COL_SPAN + 2
    );

    getCards().forEach((card) => {
      setSpans(card, preferredWidth, 9);
    });

    notifyMapResize();
  }

  function installToolbarButtons() {
    const controls = document.querySelector(".controls");
    if (!controls) return;

    const oldArrange = document.getElementById("arrange-windows");
    if (oldArrange) oldArrange.remove();

    let resetButton = document.getElementById("reset-tile-layout");

    if (!resetButton) {
      resetButton = document.createElement("button");
      resetButton.id = "reset-tile-layout";
      resetButton.type = "button";
      resetButton.textContent = "Reset tile layout";
      controls.appendChild(resetButton);
    }

    resetButton.onclick = resetTiles;

    let largeButton = document.getElementById("large-tile-layout");

    if (!largeButton) {
      largeButton = document.createElement("button");
      largeButton.id = "large-tile-layout";
      largeButton.type = "button";
      largeButton.textContent = "Make tiles larger";
      controls.appendChild(largeButton);
    }

    largeButton.onclick = makeTilesLarger;
  }

  function installSmartTiles() {
    const workspace = getWorkspace();
    if (!workspace) return;

    workspace.classList.remove("floating-map-workspace");
    workspace.classList.add("smart-tile-workspace");

    syncColumnCount();
    installToolbarButtons();

    workspace.querySelectorAll(CARD_SELECTOR).forEach(wireCard);

    const mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;

          if (node.matches?.(CARD_SELECTOR)) {
            wireCard(node);
          }

          node.querySelectorAll?.(CARD_SELECTOR).forEach(wireCard);
        }
      }
    });

    mutationObserver.observe(workspace, {
      childList: true,
      subtree: false
    });

    window.addEventListener("resize", () => {
      clearTimeout(resizeDebounce);

      resizeDebounce = setTimeout(() => {
        syncColumnCount();
      }, 120);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installSmartTiles);
  } else {
    installSmartTiles();
  }
})();
