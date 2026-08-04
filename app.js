const CSS_PIXELS_PER_INCH = 96;
const EARTH_RADIUS_METERS = 6378137;

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

    document.getElementById("apply-scale").addEventListener("click", applyScaleToAllMaps);
    document.getElementById("add-map").addEventListener("click", () => addMapPanel());
    document.getElementById("feet-per-inch").addEventListener("change", applyScaleToAllMaps);

    DEFAULT_LOCATIONS.forEach((location) => addMapPanel(location));
    setStatus('Ready. All maps are locked to the same value of 1 inch = feet.');
  } catch (error) {
    console.error(error);
    setStatus("Google Maps could not load. Check the browser console, API key, billing, and key restrictions.", true);
  }
};

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
    2 * Math.PI * EARTH_RADIUS_METERS * Math.cos(latitudeRadians);

  const zoom = Math.log2(
    circumferenceAtLatitude / (256 * metersPerPixel)
  );

  return Math.max(0, Math.min(22, zoom));
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
      setStatus(`Moved a map to ${place.displayName || place.formattedAddress || "the selected place"}.`);
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
  updatePanelFooter(panel);
}

function applyScaleToAllMaps() {
  for (const panel of panels.values()) {
    applyScaleToPanel(panel);
  }

  setStatus(`Applied 1 inch = ${getFeetPerInch().toLocaleString()} feet to every map.`);
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

function updatePanelFooter(panel) {
  const center = panel.map.getCenter();
  if (!center) return;

  panel.coordinates.textContent =
    `${center.lat().toFixed(5)}, ${center.lng().toFixed(5)} · ` +
    `1\" = ${getFeetPerInch().toLocaleString()}′`;
}

function setStatus(message, isError = false) {
  const status = document.getElementById("status");
  status.textContent = message;
  status.style.color = isError ? "#9b1c1c" : "#4b5563";
}

