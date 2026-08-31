(() => {
  const CSS_PIXELS_PER_INCH = 96;
  const FEET_PER_MILE = 5280;

  const OVERLAYS = [
    {
      checkboxId: "overlay-quarter-circle",
      name: "Quarter Mile Circle",
      miles: 0.25,
      shape: "circle"
    },
    {
      checkboxId: "overlay-quarter-diamond",
      name: "Quarter Mile Diamond",
      miles: 0.25,
      shape: "diamond"
    },
    {
      checkboxId: "overlay-half-circle",
      name: "Half Mile Circle",
      miles: 0.5,
      shape: "circle"
    },
    {
      checkboxId: "overlay-half-diamond",
      name: "Half Mile Diamond",
      miles: 0.5,
      shape: "diamond"
    }
  ];

  function getFeetPerInch() {
    const input = document.getElementById("feet-per-inch");
    const value = Number(input?.value);

    return Number.isFinite(value) && value > 0
      ? value
      : 2000;
  }

  function radiusPixels(miles) {
    return (
      (miles * FEET_PER_MILE / getFeetPerInch()) *
      CSS_PIXELS_PER_INCH
    );
  }

  function isEnabled(checkboxId) {
    const checkbox = document.getElementById(checkboxId);
    return Boolean(checkbox?.checked);
  }

  function escapeXml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }

  function shapeSvg(definition, cx, cy) {
    const r = radiusPixels(definition.miles);

    const common =
      `fill="none" ` +
      `stroke="#ffffff" ` +
      `stroke-width="6" ` +
      `stroke-dasharray="18 12" ` +
      `stroke-linecap="butt" ` +
      `stroke-linejoin="miter"`;

    if (definition.shape === "circle") {
      return `
        <g id="${escapeXml(definition.name.replaceAll(" ", "-").toLowerCase())}">
          <circle
            cx="${cx}"
            cy="${cy}"
            r="${r}"
            ${common}
          />
        </g>
      `;
    }

    const points = [
      `${cx},${cy - r}`,
      `${cx + r},${cy}`,
      `${cx},${cy + r}`,
      `${cx - r},${cy}`
    ].join(" ");

    return `
      <g id="${escapeXml(definition.name.replaceAll(" ", "-").toLowerCase())}">
        <polygon
          points="${points}"
          ${common}
        />
      </g>
    `;
  }

  function buildSvgForCard(card) {
    const shell = card.querySelector(".map-shell");

    if (!shell) {
      throw new Error("Map shell not found.");
    }

    const rect = shell.getBoundingClientRect();

    const widthPx = Math.max(1, rect.width);
    const heightPx = Math.max(1, rect.height);

    const widthIn = widthPx / CSS_PIXELS_PER_INCH;
    const heightIn = heightPx / CSS_PIXELS_PER_INCH;

    const cx = widthPx / 2;
    const cy = heightPx / 2;

    const activeOverlays = OVERLAYS.filter((overlay) =>
      isEnabled(overlay.checkboxId)
    );

    if (activeOverlays.length === 0) {
      throw new Error(
        "Turn on at least one circle or diamond before exporting."
      );
    }

    const shapes = activeOverlays
      .map((overlay) => shapeSvg(overlay, cx, cy))
      .join("\n");

    const feetPerInch = getFeetPerInch();

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg
  xmlns="http://www.w3.org/2000/svg"
  width="${widthIn}in"
  height="${heightIn}in"
  viewBox="0 0 ${widthPx} ${heightPx}"
>
  <title>Scale Comparisons Vector Overlays</title>
  <desc>
    Transparent vector overlays exported at 1 inch = ${feetPerInch} feet.
    SVG artboard matches the current map frame.
  </desc>

  ${shapes}
</svg>`;
  }

  function downloadSvg(svgText, filename) {
    const blob = new Blob(
      [svgText],
      { type: "image/svg+xml;charset=utf-8" }
    );

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function exportCard(card) {
    try {
      const svg = buildSvgForCard(card);

      const mapNumber =
        card.dataset.tileNumber ||
        card.dataset.panelId ||
        "map";

      const scale =
        String(getFeetPerInch())
          .replaceAll(".", "-");

      downloadSvg(
        svg,
        `map-${mapNumber}-overlays-1in-${scale}ft.svg`
      );
    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  }

  function addExportButton(card) {
    if (
      !card ||
      card.dataset.vectorExportReady === "true"
    ) {
      return;
    }

    card.dataset.vectorExportReady = "true";

    const footer = card.querySelector(".map-footer");

    if (!footer) return;

    const button = document.createElement("button");

    button.type = "button";
    button.className = "vector-export-button";
    button.textContent = "Export SVG";
    button.title =
      "Download the active circles and diamonds as editable SVG vectors";

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      exportCard(card);
    });

    footer.appendChild(button);
  }

  function installVectorExport() {
    const mapGrid = document.getElementById("map-grid");

    if (!mapGrid) return;

    mapGrid
      .querySelectorAll(".map-card")
      .forEach(addExportButton);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;

          if (node.matches?.(".map-card")) {
            addExportButton(node);
          }

          node
            .querySelectorAll?.(".map-card")
            .forEach(addExportButton);
        }
      }
    });

    observer.observe(mapGrid, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      installVectorExport
    );
  } else {
    installVectorExport();
  }
})();
