const openExportPanelBtn = document.getElementById("openExportPanelBtn");
const exportModal = document.getElementById("exportModal");
const closeExportPanelBtn = document.getElementById("closeExportPanelBtn");
const closeExportPanelBackdrop = document.getElementById("closeExportPanelBackdrop");

const exportGeojsonBtn = document.getElementById("exportGeojsonBtn");
const currentMapViewOutput = document.getElementById("currentMapViewOutput");
const refreshMapViewBtn = document.getElementById("refreshMapViewBtn");
const copyMapViewBtn = document.getElementById("copyMapViewBtn");
const downloadMapViewBtn = document.getElementById("downloadMapViewBtn");

const DEFAULT_CENTER = [15.5, 49.8];
const DEFAULT_ZOOM = 6;

const STYLE_CONFIG = {
  light: {
    path: "./styles/style-light.json",
    label: "Light"
  },
  tourist: {
    path: "./styles/style-tourist.json",
    label: "Turistická"
  },
  water: {
    path: "./styles/style-water.json",
    label: "Vodní"
  }
};

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
const OVERPASS_TIMEOUT = 40;

const styleButtons = document.querySelectorAll(".style-btn[data-style]");
const resetViewBtn = document.getElementById("resetViewBtn");
// const exportGeojsonBtn = document.getElementById("exportGeojsonBtn");
const statusBox = document.getElementById("statusBox");

let map = null;
let currentStyleKey = "light";
let clickPopup = null;

function setStatus(message) {
  statusBox.textContent = message;
}

function setActiveButton(styleKey) {
  styleButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.style === styleKey);
  });
}

function createMap() {
  map = new maplibregl.Map({
    container: "map",
    style: STYLE_CONFIG[currentStyleKey].path,
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    maxZoom: 17
  });

  map.addControl(new maplibregl.NavigationControl(), "top-right");
  map.addControl(
    new maplibregl.ScaleControl({ maxWidth: 120, unit: "metric" }),
    "bottom-right"
  );

  map.on("style.load", () => {
    setStatus(
      `Mapa načtena.\nStyl: ${STYLE_CONFIG[currentStyleKey].label}\nZdroj mapy: OSMF Shortbread`
    );
  });

  map.on("moveend", () => {
    if (!exportModal.classList.contains("hidden")) {
      updateCurrentMapViewOutput();
    }
  });

  map.on("click", (event) => {
    const { lng, lat } = event.lngLat;

    if (clickPopup) {
      clickPopup.remove();
    }

    clickPopup = new maplibregl.Popup({ offset: 10 })
      .setLngLat([lng, lat])
      .setHTML(`
        <strong>Kliknutý bod</strong><br>
        Lng: ${lng.toFixed(6)}<br>
        Lat: ${lat.toFixed(6)}
      `)
      .addTo(map);

    setStatus(
      `Styl: ${STYLE_CONFIG[currentStyleKey].label}\nLng: ${lng.toFixed(6)}\nLat: ${lat.toFixed(6)}`
    );
  });

  map.on("error", (event) => {
    const message = event?.error?.message || "Nepodařilo se načíst mapu nebo styl.";
    setStatus(`Chyba:\n${message}`);
  });
}

function switchStyle(styleKey) {
  if (!map || !STYLE_CONFIG[styleKey]) return;

  currentStyleKey = styleKey;
  setActiveButton(styleKey);
  setStatus(`Načítám styl: ${STYLE_CONFIG[styleKey].label}...`);

  map.setStyle(STYLE_CONFIG[styleKey].path);
}

function getCurrentBbox() {
  const bounds = map.getBounds();

  return {
    south: bounds.getSouth(),
    west: bounds.getWest(),
    north: bounds.getNorth(),
    east: bounds.getEast()
  };
}

function buildOverpassQuery(bbox) {
  const { south, west, north, east } = bbox;

  return `
[out:json][timeout:${OVERPASS_TIMEOUT}];
(
  node["place"](${south},${west},${north},${east});
  way["place"](${south},${west},${north},${east});
  relation["place"](${south},${west},${north},${east});

  way["highway"](${south},${west},${north},${east});
  relation["highway"](${south},${west},${north},${east});

  way["building"](${south},${west},${north},${east});
  relation["building"](${south},${west},${north},${east});

  way["waterway"](${south},${west},${north},${east});
  relation["waterway"](${south},${west},${north},${east});
  way["natural"="water"](${south},${west},${north},${east});
  relation["natural"="water"](${south},${west},${north},${east});

  way["landuse"](${south},${west},${north},${east});
  relation["landuse"](${south},${west},${north},${east});
  way["natural"](${south},${west},${north},${east});
  relation["natural"](${south},${west},${north},${east});

  way["aerialway"](${south},${west},${north},${east});
  relation["aerialway"](${south},${west},${north},${east});

  relation["route"="ferry"](${south},${west},${north},${east});
);
out body;
>;
out skel qt;
`.trim();
}

function detectExportClassification(tags) {
  if (tags.highway) {
    return {
      theme: "transport",
      key: "highway",
      value: tags.highway,
      className: `highway:${tags.highway}`
    };
  }

  if (tags.waterway) {
    return {
      theme: "water",
      key: "waterway",
      value: tags.waterway,
      className: `waterway:${tags.waterway}`
    };
  }

  if (tags.natural === "water") {
    return {
      theme: "water",
      key: "natural",
      value: "water",
      className: "natural:water"
    };
  }

  if (tags.landuse) {
    return {
      theme: "land",
      key: "landuse",
      value: tags.landuse,
      className: `landuse:${tags.landuse}`
    };
  }

  if (tags.natural) {
    return {
      theme: "land",
      key: "natural",
      value: tags.natural,
      className: `natural:${tags.natural}`
    };
  }

  if (tags.building) {
    return {
      theme: "building",
      key: "building",
      value: tags.building,
      className: `building:${tags.building}`
    };
  }

  if (tags.place) {
    return {
      theme: "place",
      key: "place",
      value: tags.place,
      className: `place:${tags.place}`
    };
  }

  if (tags.aerialway) {
    return {
      theme: "transport",
      key: "aerialway",
      value: tags.aerialway,
      className: `aerialway:${tags.aerialway}`
    };
  }

  if (tags.route === "ferry") {
    return {
      theme: "transport",
      key: "route",
      value: "ferry",
      className: "route:ferry"
    };
  }

  return {
    theme: "other",
    key: null,
    value: null,
    className: "other"
  };
}

function normalizeFeature(feature) {
  const rawProps = feature.properties || {};
  const featureId = typeof feature.id === "string" ? feature.id : "";
  const [osmElement = null, osmIdRaw = null] = featureId.split("/");

  const osmId = osmIdRaw !== null && osmIdRaw !== undefined
    ? Number(osmIdRaw)
    : null;

  const classification = detectExportClassification(rawProps);

  const mergedProps = {
    ...rawProps,
    osm_id: Number.isFinite(osmId) ? osmId : osmIdRaw,
    osm_element: osmElement,
    export_theme: classification.theme,
    export_key: classification.key,
    export_value: classification.value,
    export_class: classification.className
  };

  return {
    ...feature,
    properties: mergedProps
  };
}

function createFeatureCollection(features) {
  return {
    type: "FeatureCollection",
    features
  };
}

function splitFeaturesByGeometry(features) {
  const pointTypes = new Set(["Point", "MultiPoint"]);
  const lineTypes = new Set(["LineString", "MultiLineString"]);
  const polygonTypes = new Set(["Polygon", "MultiPolygon"]);

  const points = [];
  const lines = [];
  const polygons = [];

  features.forEach((feature) => {
    const geometryType = feature?.geometry?.type;

    if (pointTypes.has(geometryType)) {
      points.push(feature);
    } else if (lineTypes.has(geometryType)) {
      lines.push(feature);
    } else if (polygonTypes.has(geometryType)) {
      polygons.push(feature);
    }
  });

  return { points, lines, polygons };
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

function buildReadmeText(bbox, counts, totalCount) {
  return [
    "OSM bbox export",
    "",
    `South: ${bbox.south}`,
    `West: ${bbox.west}`,
    `North: ${bbox.north}`,
    `East: ${bbox.east}`,
    "",
    `Total features: ${totalCount}`,
    `Points: ${counts.points.length}`,
    `Lines: ${counts.lines.length}`,
    `Polygons: ${counts.polygons.length}`,
    "",
    "Files:",
    "- bbox_all.geojson",
    "- bbox_points.geojson",
    "- bbox_lines.geojson",
    "- bbox_polygons.geojson",
    "",
    "Poznámka:",
    "- Sloupec export_category pomáhá filtrovat prvky v GIS.",
    "- Hodnoty typicky: roads, water, buildings, places, land, aerialway, ferry, other."
  ].join("\n");
}

function openExportPanel() {
  exportModal.classList.remove("hidden");
  updateCurrentMapViewOutput();
}

function closeExportPanel() {
  exportModal.classList.add("hidden");
}

function getCurrentMapViewData() {
  if (!map) return null;

  const center = map.getCenter();
  const bounds = map.getBounds();

  return {
    style_key: currentStyleKey,
    style_label: STYLE_CONFIG[currentStyleKey]?.label ?? currentStyleKey,
    center: {
      lng: Number(center.lng.toFixed(6)),
      lat: Number(center.lat.toFixed(6))
    },
    zoom: Number(map.getZoom().toFixed(3)),
    bearing: Number(map.getBearing().toFixed(3)),
    pitch: Number(map.getPitch().toFixed(3)),
    bbox: {
      west: Number(bounds.getWest().toFixed(6)),
      south: Number(bounds.getSouth().toFixed(6)),
      east: Number(bounds.getEast().toFixed(6)),
      north: Number(bounds.getNorth().toFixed(6))
    }
  };
}

function updateCurrentMapViewOutput() {
  const mapView = getCurrentMapViewData();
  if (!mapView) {
    currentMapViewOutput.value = "";
    return;
  }

  currentMapViewOutput.value = JSON.stringify(mapView, null, 2);
}

async function copyCurrentMapView() {
  try {
    await navigator.clipboard.writeText(currentMapViewOutput.value);
    setStatus("Current map view zkopírován do schránky.");
  } catch (error) {
    setStatus("Nepodařilo se zkopírovat current map view.");
  }
}

function downloadCurrentMapView() {
  const mapView = getCurrentMapViewData();
  if (!mapView) return;

  const blob = new Blob(
    [JSON.stringify(mapView, null, 2)],
    { type: "application/json;charset=utf-8" }
  );

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  downloadBlob(blob, `current_map_view_${timestamp}.json`);
  setStatus("Current map view byl uložen jako JSON.");
}

async function exportCurrentBboxGeoJSON() {
  if (!map) return;

  const bbox = getCurrentBbox();
  const bboxWidth = Math.abs(bbox.east - bbox.west);
  const bboxHeight = Math.abs(bbox.north - bbox.south);

  if (bboxWidth > 1.5 || bboxHeight > 1.5) {
    setStatus(
      "Aktuální mapové okno je moc velké pro první export.\n" +
      "Přibliž mapu na menší oblast a zkus to znovu."
    );
    return;
  }

  exportGeojsonBtn.disabled = true;
  setStatus("Stahuji OSM data pro aktuální bbox...");

  try {
    const query = buildOverpassQuery(bbox);

    const response = await fetch(OVERPASS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=UTF-8"
      },
      body: query
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Overpass vrátil ${response.status}: ${errorText.slice(0, 250)}`);
    }

    const osmJson = await response.json();
    const geojson = osmtogeojson(osmJson);
    const normalizedFeatures = geojson.features.map(normalizeFeature);

    if (normalizedFeatures.length === 0) {
      throw new Error("V aktuálním mapovém okně nebyla nalezena žádná exportovatelná data.");
    }

    const grouped = splitFeaturesByGeometry(normalizedFeatures);
    const zip = new JSZip();

    zip.file(
      "bbox_all.geojson",
      JSON.stringify(createFeatureCollection(normalizedFeatures), null, 2)
    );

    zip.file(
      "bbox_points.geojson",
      JSON.stringify(createFeatureCollection(grouped.points), null, 2)
    );

    zip.file(
      "bbox_lines.geojson",
      JSON.stringify(createFeatureCollection(grouped.lines), null, 2)
    );

    zip.file(
      "bbox_polygons.geojson",
      JSON.stringify(createFeatureCollection(grouped.polygons), null, 2)
    );

    zip.file(
      "README.txt",
      buildReadmeText(bbox, grouped, normalizedFeatures.length)
    );

    const zipBlob = await zip.generateAsync({ type: "blob" });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    downloadBlob(zipBlob, `osm_bbox_export_${timestamp}.zip`);

    setStatus(
      `Export hotov.\n` +
      `Celkem prvků: ${normalizedFeatures.length}\n` +
      `Body: ${grouped.points.length}\n` +
      `Linie: ${grouped.lines.length}\n` +
      `Polygony: ${grouped.polygons.length}`
    );
  } catch (error) {
    setStatus(`Chyba exportu:\n${error.message}`);
  } finally {
    exportGeojsonBtn.disabled = false;
  }
}

styleButtons.forEach((button) => {
  button.addEventListener("click", () => {
    switchStyle(button.dataset.style);
  });
});

resetViewBtn.addEventListener("click", () => {
  if (!map) return;

  map.flyTo({
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    duration: 1000
  });

  setStatus(`Pohled resetován.\nStyl: ${STYLE_CONFIG[currentStyleKey].label}`);
});

exportGeojsonBtn.addEventListener("click", exportCurrentBboxGeoJSON);

openExportPanelBtn.addEventListener("click", openExportPanel);
closeExportPanelBtn.addEventListener("click", closeExportPanel);
closeExportPanelBackdrop.addEventListener("click", closeExportPanel);

refreshMapViewBtn.addEventListener("click", updateCurrentMapViewOutput);
copyMapViewBtn.addEventListener("click", copyCurrentMapView);
downloadMapViewBtn.addEventListener("click", downloadCurrentMapView);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !exportModal.classList.contains("hidden")) {
    closeExportPanel();
  }
});

createMap();