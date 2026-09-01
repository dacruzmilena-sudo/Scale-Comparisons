const APP_VERSION = "print-paper-v1";
const CSS_PIXELS_PER_INCH = 96;
const EARTH_RADIUS_METERS = 6378137;
const FEET_PER_MILE = 5280;

// Every map option shown in each tile's View dropdown.
// Standard Google views have no mapId.
// Cloud-styled views use their Google Maps Platform Map ID.
const MAP_VIEWS = {
  hybrid: {
    label: "Hybrid",
    mapTypeId: "hybrid"
  },
  satellite: {
    label: "Satellite",
    mapTypeId: "satellite"
  },
  roadmap: {
    label: "Road map",
    mapTypeId: "roadmap"
  },
  terrain: {
    label: "Terrain",
    mapTypeId: "terrain"
  },
  darkGraphicsWhiteRoads: {
    label: "Dark Graphics; White Roads",
    mapTypeId: "roadmap",
    mapId: "c5eb7c67b72d5ac2e1152e66",
    colorScheme: "DARK"
  },
  roadsOnlyWhite: {
    label: "Roads Only (White)",
    mapTypeId: "hybrid",
    mapId: "c5eb7c67b72d5ac28afc71e2"
  }
};

// Paper sizes used by the site BEFORE opening the browser print dialog.
// This lets Google Maps redraw to the actual printable dimensions first.
const PRINT_PAPERS = {
  letter: { label: "Letter 8.5 × 11", width: 8.5, height: 11 },
  tabloid: { label: "Tabloid 11 × 17", width: 11, height: 17 },
  archC: { label: "ARCH C 18 × 24", width: 18, height: 24 },
  archD: { label: "ARCH D 24 × 36", width: 24, height: 36 },
  archE: { label: "ARCH E 36 × 48", width: 36, height: 48 }
};

const PRINT_MARGIN_IN = 0.5;
const PRINT_FOOTER_ALLOWANCE_IN = 0.35;
let printRestoreState = null;

const DEFAULT_LOCATIONS = [
  { lat: 26.70577, lng: -81.94787 },
  { lat: 25.76168, lng: -80.19179 },
  { lat: 28.53834, lng: -81.37924 },
  { lat: 27.95058, lng: -82.45718 }
];

const OVERLAY_DEFINITIONS = [
  {
    key: "quarter-circle",
    label: "¼ mi circle",
    miles: 0.25,
    shape: "circle",
    checked: true
  },
  {
    key: "quarter-diamond",
    label: "¼ mi diamond",
    miles: 0.25,
    shape: "diamond",
    checked: false
  },
  {
    key: "half-circle",
    label: "½ mi circle",
    miles: 0.5,
    shape: "circle",
    checked: false
  },
  {
    key: "half-diamond",
    label: "½ mi diamond",
    miles: 0.5,
    shape: "diamond",
    checked: false
  }
];

const panels = new Map();

let GoogleMap;
let PlaceAutocompleteElement;
let nextPanelId = 1;

window.initApp = async function initApp() {
  try {
    const mapsLibrary = await google.maps.importLibrary("maps");
    const placesLibrary = await google.maps.importLibrary("places");

    GoogleMap = mapsLibrary.Map;
    PlaceAutocompleteElement = placesLibrary.PlaceAutocompleteElement;

    installExtraControls();

    document
      .getElementById("apply-scale")
      .addEventListener("click", applyScaleToAllMaps);

    document
      .getElementById("add-map")
      .addEventListener("click", () => addMapPanel());

    document
      .getElementById("feet-per-inch")
      .addEventListener("change", applyScaleToAllMaps);

    DEFAULT_LOCATIONS.forEach((location) => addMapPanel(location));

    setStatus(
      "Ready — 6 map views loaded. All maps are locked to the same ground scale."
    );
  } catch (error) {
    console.error(error);

    setStatus(
      "Google Maps could not load. Check the browser console, API key, billing, and key restrictions.",
      true
    );
  }
};

function installExtraControls() {
  const controls = document.querySelector(".controls");
  if (!controls) return;

  // Remove the old single overlay dropdown if an older script added it.
  const oldShapeControl = document.querySelector(".shape-control");
  const oldShapeHelper = document.querySelector(".shape-helper");

  if (oldShapeControl) oldShapeControl.remove();
  if (oldShapeHelper) oldShapeHelper.remove();

  if (!document.getElementById("overlay-controls")) {
    const overlayGroup = document.createElement("fieldset");
    overlayGroup.id = "overlay-controls";
    overlayGroup.className = "overlay-control-group";

    const legend = document.createElement("legend");
    legend.textContent = "Distance overlays";
    overlayGroup.appendChild(legend);

    for (const definition of OVERLAY_DEFINITIONS) {
      const label = document.createElement("label");
      label.className = "overlay-toggle";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = `overlay-${definition.key}`;
      checkbox.dataset.overlayKey = definition.key;
      checkbox.checked = definition.checked;

      const text = document.createElement("span");
      text.textContent = definition.label;

      label.append(checkbox, text);
      overlayGroup.appendChild(label);

      checkbox.addEventListener("change", () => {
        updateAllOverlays();
        setStatus("Distance overlays updated.");
      });
    }

    controls.appendChild(overlayGroup);
  }

  if (!document.getElementById("print-settings")) {
    const printGroup = document.createElement("fieldset");
    printGroup.id = "print-settings";
    printGroup.className = "print-settings-group";

    const legend = document.createElement("legend");
    legend.textContent = "Print sheet";
    printGroup.appendChild(legend);

    const paperLabel = document.createElement("label");
    paperLabel.textContent = "Paper";

    const paperSelect = document.createElement("select");
    paperSelect.id = "print-paper";

    for (const [paperKey, paper] of Object.entries(PRINT_PAPERS)) {
      const option = document.createElement("option");
      option.value = paperKey;
      option.textContent = paper.label;
      paperSelect.appendChild(option);
    }

    paperSelect.value = "letter";
    paperLabel.appendChild(paperSelect);

    const orientationLabel = document.createElement("label");
    orientationLabel.textContent = "Orientation";

    const orientationSelect = document.createElement("select");
    orientationSelect.id = "print-orientation";

    const portrait = document.createElement("option");
    portrait.value = "portrait";
    portrait.textContent = "Portrait";

    const landscape = document.createElement("option");
    landscape.value = "landscape";
    landscape.textContent = "Landscape";

    orientationSelect.append(portrait, landscape);
    orientationLabel.appendChild(orientationSelect);

    printGroup.append(paperLabel, orientationLabel);
    controls.appendChild(printGroup);
  }

  if (!document.getElementById("export-maps")) {
    const exportButton = document.createElement("button");
    exportButton.id = "export-maps";
    exportButton.type = "button";
    exportButton.textContent = "Export / Print PDF";

    exportButton.addEventListener("click", exportMaps);
    controls.appendChild(exportButton);
  }
}

function getFeetPerInch() {
  const input = document.getElementById("feet-per-inch");
  const value = Number(input.value);

  if (!Number.isFinite(value) || value <= 0) {
    input.value = "2000";
    return 2000;
  }

  return value;
}

function zoomForScale(latitude, feetPerInch) {
  const metersPerPixel = (feetPerInch * 0.3048) / CSS_PIXELS_PER_INCH;
  const latitudeRadians = latitude * Math.PI / 180;

  const circumferenceAtLatitude =
    2 *
    Math.PI *
    EARTH_RADIUS_METERS *
    Math.cos(latitudeRadians);

  const zoom = Math.log2(
    circumferenceAtLatitude / (256 * metersPerPixel)
  );

  return Math.max(0, Math.min(22, zoom));
}

function radiusPixelsForMiles(miles) {
  const feet = miles * FEET_PER_MILE;

  return (
    (feet / getFeetPerInch()) *
    CSS_PIXELS_PER_INCH
  );
}

function overlayIsEnabled(key) {
  const checkbox = document.getElementById(`overlay-${key}`);
  return Boolean(checkbox && checkbox.checked);
}


function populateMapTypeSelect(selectElement) {
  selectElement.replaceChildren();

  for (const [viewKey, view] of Object.entries(MAP_VIEWS)) {
    const option = document.createElement("option");
    option.value = viewKey;
    option.textContent = view.label;
    selectElement.appendChild(option);
  }
}

function buildMapOptions(center, zoom, viewKey) {
  const view = MAP_VIEWS[viewKey] || MAP_VIEWS.hybrid;

  const options = {
    center,
    zoom,
    mapTypeId: view.mapTypeId,
    isFractionalZoomEnabled: true,
    mapTypeControl: false,
    streetViewControl: false,
    tilt: 0,
    heading: 0
  };

  if (view.mapId) {
    options.mapId = view.mapId;
  }

  if (view.colorScheme) {
    // Color scheme, like mapId, must be chosen when the 2D map is created.
    options.colorScheme = view.colorScheme;
  }

  return options;
}

function attachPanelMapListeners(panel) {
  panel.map.addListener("idle", () => {
    keepPanelAtSelectedScale(panel);
    updatePanelFooter(panel);
  });
}

function switchMapView(panel, viewKey) {
  const view = MAP_VIEWS[viewKey];

  if (!view) {
    setStatus("That map view is not configured.", true);
    return;
  }

  const oldMap = panel.map;
  const center = oldMap.getCenter();
  const currentZoom = oldMap.getZoom();

  if (!center) return;

  const mapElement = panel.card.querySelector(".map");

  // A 2D Google Map's Map ID cannot be changed after creation,
  // so switching to/from a cloud style creates a fresh map in
  // the same tile while preserving center and scale.
  google.maps.event.clearInstanceListeners(oldMap);
  mapElement.replaceChildren();

  panel.map = new GoogleMap(
    mapElement,
    buildMapOptions(
      center,
      typeof currentZoom === "number"
        ? currentZoom
        : zoomForScale(center.lat(), getFeetPerInch()),
      viewKey
    )
  );

  panel.currentViewKey = viewKey;
  attachPanelMapListeners(panel);

  // Re-apply the exact selected ground scale after the map is recreated.
  applyScaleToPanel(panel);

  setStatus(`Map view changed to ${view.label}.`);
}

function addMapPanel(center) {
  const mapGrid = document.getElementById("map-grid");
  const template = document.getElementById("map-panel-template");
  const fragment = template.content.cloneNode(true);

  const card = fragment.querySelector(".map-card");
  const mapElement = fragment.querySelector(".map");
  const searchSlot = fragment.querySelector(".search-slot");
  const removeButton = fragment.querySelector(".remove-map");
  const coordinates = fragment.querySelector(".coordinates");
  const mapType = fragment.querySelector(".map-type");

  populateMapTypeSelect(mapType);

  const id = nextPanelId++;
  const initialCenter =
    center ||
    firstMapCenter() ||
    DEFAULT_LOCATIONS[0];

  card.dataset.panelId = String(id);
  mapGrid.appendChild(fragment);

  const mapShell = document.createElement("div");
  mapShell.className = "map-shell";

  mapElement.parentNode.insertBefore(mapShell, mapElement);
  mapShell.appendChild(mapElement);

  const overlayElements = new Map();

  for (const definition of OVERLAY_DEFINITIONS) {
    const overlay = document.createElement("div");

    overlay.className =
      `distance-overlay overlay-${definition.shape} overlay-${definition.key}`;

    overlay.dataset.overlayKey = definition.key;
    overlay.setAttribute("aria-hidden", "true");

    mapShell.appendChild(overlay);
    overlayElements.set(definition.key, overlay);
  }

  const scaleBar = createScaleBar();
  mapShell.appendChild(scaleBar.root);

  const initialViewKey = "hybrid";

  const map = new GoogleMap(
    mapElement,
    buildMapOptions(
      initialCenter,
      zoomForScale(
        initialCenter.lat,
        getFeetPerInch()
      ),
      initialViewKey
    )
  );

  mapType.value = initialViewKey;

  const autocomplete = new PlaceAutocompleteElement();
  autocomplete.placeholder = "Search for a place";
  searchSlot.appendChild(autocomplete);

  const panel = {
    id,
    card,
    map,
    coordinates,
    overlayElements,
    scaleBar,
    adjustingScale: false,
    currentViewKey: initialViewKey
  };

  panels.set(id, panel);

  autocomplete.addEventListener(
    "gmp-select",
    async (event) => {
      try {
        const place =
          event.placePrediction.toPlace();

        await place.fetchFields({
          fields: [
            "displayName",
            "formattedAddress",
            "location"
          ]
        });

        if (!place.location) {
          setStatus(
            "That search result did not include a location.",
            true
          );
          return;
        }

        panel.map.setCenter(place.location);
        applyScaleToPanel(panel);

        setStatus(
          `Moved a map to ${
            place.displayName ||
            place.formattedAddress ||
            "the selected place"
          }.`
        );
      } catch (error) {
        console.error(error);

        setStatus(
          "The selected place could not be loaded.",
          true
        );
      }
    }
  );

  attachPanelMapListeners(panel);

  mapType.addEventListener(
    "change",
    () => {
      switchMapView(panel, mapType.value);
    }
  );

  removeButton.addEventListener(
    "click",
    () => {
      if (panels.size === 1) {
        setStatus(
          "Keep at least one map open.",
          true
        );
        return;
      }

      panels.delete(id);
      card.remove();
      setStatus("Map removed.");
    }
  );

  updatePanelOverlays(panel);
  updateScaleBar(panel);
  updatePanelFooter(panel);
}

function createScaleBar() {
  const root = document.createElement("div");
  root.className = "custom-scale-bar";
  root.setAttribute(
    "aria-label",
    "One inch map scale bar"
  );

  const label = document.createElement("div");
  label.className = "custom-scale-label";

  const line = document.createElement("div");
  line.className = "custom-scale-line";

  root.append(label, line);

  return {
    root,
    label,
    line
  };
}

function firstMapCenter() {
  const firstPanel =
    panels.values().next().value;

  if (!firstPanel) return null;

  const center =
    firstPanel.map.getCenter();

  return center
    ? {
        lat: center.lat(),
        lng: center.lng()
      }
    : null;
}

function applyScaleToPanel(panel) {
  const center =
    panel.map.getCenter();

  if (!center) return;

  panel.adjustingScale = true;

  panel.map.setZoom(
    zoomForScale(
      center.lat(),
      getFeetPerInch()
    )
  );

  updatePanelOverlays(panel);
  updateScaleBar(panel);
  updatePanelFooter(panel);
}

function applyScaleToAllMaps() {
  for (const panel of panels.values()) {
    applyScaleToPanel(panel);
  }

  setStatus(
    `Applied 1 inch = ${getFeetPerInch().toLocaleString()} feet to every map.`
  );
}

function keepPanelAtSelectedScale(panel) {
  if (panel.adjustingScale) {
    panel.adjustingScale = false;
    return;
  }

  const center =
    panel.map.getCenter();

  const currentZoom =
    panel.map.getZoom();

  if (
    !center ||
    typeof currentZoom !== "number"
  ) {
    return;
  }

  const targetZoom =
    zoomForScale(
      center.lat(),
      getFeetPerInch()
    );

  if (
    Math.abs(
      currentZoom - targetZoom
    ) > 0.01
  ) {
    panel.adjustingScale = true;
    panel.map.setZoom(targetZoom);
  }
}

function updatePanelOverlays(panel) {
  for (const definition of OVERLAY_DEFINITIONS) {
    const overlay =
      panel.overlayElements.get(
        definition.key
      );

    if (!overlay) continue;

    if (!overlayIsEnabled(definition.key)) {
      overlay.hidden = true;
      continue;
    }

    const radiusPx =
      radiusPixelsForMiles(
        definition.miles
      );

    overlay.hidden = false;

    if (definition.shape === "circle") {
      const diameterPx =
        radiusPx * 2;

      overlay.style.width =
        `${diameterPx}px`;

      overlay.style.height =
        `${diameterPx}px`;
    }

    if (definition.shape === "diamond") {
      /*
        A rotated square with side s has
        center-to-vertex distance s / sqrt(2).

        Therefore:
        s = radius * sqrt(2)

        This makes the diamond's POINTS
        exactly 1/4 mile or 1/2 mile
        from the center.
      */
      const sidePx =
        radiusPx * Math.SQRT2;

      overlay.style.width =
        `${sidePx}px`;

      overlay.style.height =
        `${sidePx}px`;
    }
  }
}

function updateAllOverlays() {
  for (const panel of panels.values()) {
    updatePanelOverlays(panel);
  }
}

function updateScaleBar(panel) {
  if (!panel.scaleBar) return;

  panel.scaleBar.label.textContent =
    `1" = ${getFeetPerInch().toLocaleString()}′`;

  /*
    This line is exactly 1 CSS inch.
    It is physically exact in a PDF printed/exported
    at 100% / Actual size.
  */
  panel.scaleBar.line.style.width = "1in";
}

function updatePanelFooter(panel) {
  const center =
    panel.map.getCenter();

  if (!center) return;

  panel.coordinates.textContent =
    `${center.lat().toFixed(5)}, ` +
    `${center.lng().toFixed(5)} · ` +
    `1" = ${getFeetPerInch().toLocaleString()}′`;
}

function getSelectedPrintSheet() {
  const paperKey =
    document.getElementById("print-paper")?.value || "letter";

  const orientation =
    document.getElementById("print-orientation")?.value || "portrait";

  const paper = PRINT_PAPERS[paperKey] || PRINT_PAPERS.letter;

  const pageWidth =
    orientation === "landscape" ? paper.height : paper.width;

  const pageHeight =
    orientation === "landscape" ? paper.width : paper.height;

  const mapWidth = Math.max(
    1,
    pageWidth - PRINT_MARGIN_IN * 2
  );

  const mapHeight = Math.max(
    1,
    pageHeight - PRINT_MARGIN_IN * 2 - PRINT_FOOTER_ALLOWANCE_IN
  );

  return {
    paper,
    orientation,
    pageWidth,
    pageHeight,
    mapWidth,
    mapHeight
  };
}

function installDynamicPageRule(sheet) {
  let style = document.getElementById("dynamic-print-page-style");

  if (!style) {
    style = document.createElement("style");
    style.id = "dynamic-print-page-style";
    document.head.appendChild(style);
  }

  style.textContent = `
    @page {
      size: ${sheet.pageWidth}in ${sheet.pageHeight}in;
      margin: ${PRINT_MARGIN_IN}in;
    }
  `;
}

function rememberPrintState() {
  if (printRestoreState) return;

  printRestoreState = Array.from(panels.values()).map((panel) => {
    const center = panel.map.getCenter();

    return {
      panel,
      center: center
        ? { lat: center.lat(), lng: center.lng() }
        : null
    };
  });
}

function restoreAfterPrint() {
  if (!printRestoreState) return;

  document.body.classList.remove("print-preparing");

  const prepStyle = document.getElementById("print-prep-style");
  if (prepStyle) prepStyle.remove();

  for (const item of printRestoreState) {
    if (item.center) {
      item.panel.map.setCenter(item.center);
    }

    google.maps.event.trigger(item.panel.map, "resize");
    applyScaleToPanel(item.panel);
  }

  printRestoreState = null;
}

function waitForMapIdle(panel, timeoutMs = 1800) {
  return new Promise((resolve) => {
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };

    google.maps.event.addListenerOnce(panel.map, "idle", finish);
    window.setTimeout(finish, timeoutMs);
  });
}

async function prepareMapsForPrint(sheet) {
  rememberPrintState();
  installDynamicPageRule(sheet);

  document.documentElement.style.setProperty(
    "--print-map-width",
    `${sheet.mapWidth}in`
  );

  document.documentElement.style.setProperty(
    "--print-map-height",
    `${sheet.mapHeight}in`
  );

  const widthPx = sheet.mapWidth * CSS_PIXELS_PER_INCH;
  const heightPx = sheet.mapHeight * CSS_PIXELS_PER_INCH;

  let prepStyle = document.getElementById("print-prep-style");

  if (!prepStyle) {
    prepStyle = document.createElement("style");
    prepStyle.id = "print-prep-style";
    document.head.appendChild(prepStyle);
  }

  // Resize the LIVE maps before opening print preview so Google actually
  // renders the extra geographic extent available on the selected sheet.
  prepStyle.textContent = `
    body.print-preparing #map-grid.smart-tile-workspace {
      display: block !important;
      overflow: visible !important;
    }

    body.print-preparing #map-grid.smart-tile-workspace > .smart-map-tile {
      width: ${widthPx}px !important;
      height: auto !important;
      margin: 12px auto !important;
      display: flex !important;
    }

    body.print-preparing .smart-map-tile .map-shell,
    body.print-preparing .smart-map-tile .map {
      width: ${widthPx}px !important;
      height: ${heightPx}px !important;
      flex: none !important;
    }
  `;

  document.body.classList.add("print-preparing");

  const idlePromises = [];

  for (const item of printRestoreState) {
    const { panel, center } = item;

    google.maps.event.trigger(panel.map, "resize");

    if (center) {
      panel.map.setCenter(center);
    }

    applyScaleToPanel(panel);
    idlePromises.push(waitForMapIdle(panel));
  }

  await Promise.all(idlePromises);
}

async function exportMaps() {
  const sheet = getSelectedPrintSheet();

  setStatus(
    `Preparing ${sheet.paper.label} ${sheet.orientation}. ` +
    "The maps are redrawing to the printable extent at the selected scale…"
  );

  await prepareMapsForPrint(sheet);

  setStatus(
    `Print ready: ${sheet.paper.label} ${sheet.orientation}. ` +
    "In the print dialog, use the SAME paper/orientation and 100% / Actual size."
  );

  window.setTimeout(() => window.print(), 150);
}

window.addEventListener("afterprint", restoreAfterPrint);

function setStatus(
  message,
  isError = false
) {
  const status =
    document.getElementById("status");

  status.textContent = message;

  status.classList.toggle(
    "status-error",
    isError
  );
}
