const CSS_PIXELS_PER_INCH = 96;
const EARTH_RADIUS_METERS = 6378137;
const QUARTER_MILE_FEET = 1320;

const DEFAULT_LOCATIONS = [
  { lat: 26.70577, lng: -81.94787 },
  { lat: 25.76168, lng: -80.19179 },
  { lat: 28.53834, lng: -81.37924 },
  { lat: 27.95058, lng: -82.45718 }
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

    document.getElementById("apply-scale").addEventListener("click", applyScaleToAllMaps);
    document.getElementById("add-map").addEventListener("click", () => addMapPanel());
    document.getElementById("feet-per-inch").addEventListener("change", applyScaleToAllMaps);

    DEFAULT_LOCATIONS.forEach((location) => addMapPanel(location));

    setStatus("Ready. All maps are locked to the same ground scale.");
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

  // Avoid duplicates if the script is reloaded.
  if (!document.getElementById("quarter-mile-shape")) {
    const label = document.createElement("label");
    label.setAttribute("for", "quarter-mile-shape");
    label.className = "shape-control";

    const text = document.createElement("span");
    text.textContent = "¼-mile overlay";

    const select = document.createElement("select");
    select.id = "quarter-mile-shape";
    select.innerHTML = `
      <option value="circle">Circle</option>
      <option value="square">Square</option>
      <option value="none">None</option>
    `;

    label.append(text, select);
    controls.appendChild(label);

    select.addEventListener("change", () => {
      updateAllOverlays();
      const choice = select.value;

      if (choice === "circle") {
        setStatus("Showing a ¼-mile radius circle on every map.");
      } else if (choice === "square") {
        setStatus("Showing a square extending ¼ mile from its center to each side.");
      } else {
        setStatus("¼-mile overlay hidden.");
      }
    });
  }

  if (!document.getElementById("export-maps")) {
    const exportButton = document.createElement("button");
    exportButton.id = "export-maps";
    exportButton.type = "button";
    exportButton.textContent = "Export / Print PDF";
    controls.appendChild(exportButton);

    exportButton.addEventListener("click", exportMaps);
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

function getSelectedShape() {
  const select = document.getElementById("quarter-mile-shape");
  return select ? select.value : "circle";
}

function zoomForScale(latitude, feetPerInch) {
  const metersPerPixel = (feetPerInch * 0.3048) / CSS_PIXELS_PER_INCH;
  const latitudeRadians = latitude * Math.PI / 180;

  const circumferenceAtLatitude =
    2 * Math.PI * EARTH_RADIUS_METERS * Math.cos(latitudeRadians);

  const zoom = Math.log2(
    circumferenceAtLatitude / (256 * metersPerPixel)
  );

  return Math.max(0, Math.min(22, zoom));
}

function quarterMileRadiusPixels() {
  // 1 inch on the page/screen = getFeetPerInch() feet.
  // 96 CSS pixels = 1 CSS inch.
  return (QUARTER_MILE_FEET / getFeetPerInch()) * CSS_PIXELS_PER_INCH;
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

  const id = nextPanelId++;
  const initialCenter = center || firstMapCenter() || DEFAULT_LOCATIONS[0];

  card.dataset.panelId = String(id);
  mapGrid.appendChild(fragment);

  // Put the Google map and our scale overlay in the same positioned wrapper.
  const mapShell = document.createElement("div");
  mapShell.className = "map-shell";
  mapElement.parentNode.insertBefore(mapShell, mapElement);
  mapShell.appendChild(mapElement);

  const overlay = document.createElement("div");
  overlay.className = "distance-overlay";
  overlay.setAttribute("aria-hidden", "true");
  mapShell.appendChild(overlay);

  const map = new GoogleMap(mapElement, {
    center: initialCenter,
    zoom: zoomForScale(initialCenter.lat, getFeetPerInch()),
    mapTypeId: "satellite",
    isFractionalZoomEnabled: true,
    mapTypeControl: false,
    streetViewControl: false,
    tilt: 0,
    heading: 0
  });

  const autocomplete = new PlaceAutocompleteElement();
  autocomplete.placeholder = "Search for a place";
  searchSlot.appendChild(autocomplete);

  const panel = {
    id,
    card,
    map,
    coordinates,
    overlay,
    adjustingScale: false
  };

  panels.set(id, panel);

  autocomplete.addEventListener("gmp-select", async (event) => {
    try {
      const place = event.placePrediction.toPlace();

      await place.fetchFields({
        fields: ["displayName", "formattedAddress", "location"]
      });

      if (!place.location) {
        setStatus("That search result did not include a location.", true);
        return;
      }

      map.setCenter(place.location);
      applyScaleToPanel(panel);

      setStatus(
        `Moved a map to ${
          place.displayName || place.formattedAddress || "the selected place"
        }.`
      );
    } catch (error) {
      console.error(error);
      setStatus("The selected place could not be loaded.", true);
    }
  });

  map.addListener("idle", () => {
    keepPanelAtSelectedScale(panel);
    updatePanelFooter(panel);
  });

  mapType.addEventListener("change", () => {
    map.setMapTypeId(mapType.value);
  });

  removeButton.addEventListener("click", () => {
    if (panels.size === 1) {
      setStatus("Keep at least one map open.", true);
      return;
    }

    panels.delete(id);
    card.remove();
    setStatus("Map removed.");
  });

  updatePanelOverlay(panel);
  updatePanelFooter(panel);
}

function firstMapCenter() {
  const firstPanel = panels.values().next().value;
  if (!firstPanel) return null;

  const center = firstPanel.map.getCenter();
  return center ? { lat: center.lat(), lng: center.lng() } : null;
}

function applyScaleToPanel(panel) {
  const center = panel.map.getCenter();
  if (!center) return;

  panel.adjustingScale = true;
  panel.map.setZoom(zoomForScale(center.lat(), getFeetPerInch()));

  updatePanelOverlay(panel);
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

  const center = panel.map.getCenter();
  const currentZoom = panel.map.getZoom();

  if (!center || typeof currentZoom !== "number") return;

  const targetZoom = zoomForScale(center.lat(), getFeetPerInch());

  if (Math.abs(currentZoom - targetZoom) > 0.01) {
    panel.adjustingScale = true;
    panel.map.setZoom(targetZoom);
  }
}

function updatePanelOverlay(panel) {
  const overlay = panel.overlay;
  const shape = getSelectedShape();

  if (!overlay) return;

  if (shape === "none") {
    overlay.hidden = true;
    return;
  }

  const radiusPx = quarterMileRadiusPixels();
  const diameterPx = radiusPx * 2;

  overlay.hidden = false;
  overlay.style.width = `${diameterPx}px`;
  overlay.style.height = `${diameterPx}px`;

  overlay.classList.toggle("is-circle", shape === "circle");
  overlay.classList.toggle("is-square", shape === "square");
}

function updateAllOverlays() {
  for (const panel of panels.values()) {
    updatePanelOverlay(panel);
  }
}

function updatePanelFooter(panel) {
  const center = panel.map.getCenter();
  if (!center) return;

  const quarterMilePaperInches = QUARTER_MILE_FEET / getFeetPerInch();

  panel.coordinates.textContent =
    `${center.lat().toFixed(5)}, ${center.lng().toFixed(5)} · ` +
    `1" = ${getFeetPerInch().toLocaleString()}′ · ` +
    `¼-mi radius = ${quarterMilePaperInches.toFixed(3)}"`;
}

function exportMaps() {
  applyScaleToAllMaps();

  setStatus(
    "Opening print preview. Choose Save as PDF and use 100% / Actual size, not Fit."
  );

  window.setTimeout(() => {
    window.print();
  }, 300);
}

function setStatus(message, isError = false) {
  const status = document.getElementById("status");
  status.textContent = message;
  status.style.color = isError ? "#9b1c1c" : "#4b5563";
}
