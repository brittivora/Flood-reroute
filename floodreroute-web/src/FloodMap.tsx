/**
 * FloodMap.tsx
 * Route rendering over a risk-coloured road network.
 */

import type { MapMouseEvent, Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useRef, useState } from "react";
import Map, {
  Marker,
  Popup,
  type MapRef,
  type ViewStateChangeEvent,
} from "react-map-gl/maplibre";

import {
  api,
  BAND_COLOR,
  BLOCKED_COLOR,
  BLOCKED_THRESHOLD,
  PROFILE_COLOR,
  PROFILE_LABEL,
  type LatLon,
  type RainfallLevel,
  type RiskBand,
  type Route,
  type RouteProfile,
} from "./api";

const MUMBAI = { longitude: 72.877, latitude: 19.076, zoom: 12 };
const RISK_MIN_ZOOM = 12;

// Danger first so it sits underneath; selected route is moved last.
const DRAW_ORDER: RouteProfile[] = ["danger", "fastest", "safest"];

const RISK_SRC = "risk-src";
const RISK_LAYER = "risk-roads";
const BLOCKED_LAYER = "risk-blocked";

const STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: "raster" as const,
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [
    { id: "bg", type: "background" as const, paint: { "background-color": "#0b1215" } },
    {
      id: "osm",
      type: "raster" as const,
      source: "osm",
      paint: {
        "raster-opacity": 0.5,
        "raster-saturation": -0.5,
        "raster-brightness-max": 0.75,
      },
    },
  ],
};

interface Props {
  origin: LatLon | null;
  destination: LatLon | null;
  routes: Record<RouteProfile, Route> | null;
  selected: RouteProfile;
  rainfall: RainfallLevel;
  showRiskLayer: boolean;
  onMapClick: (p: LatLon) => void;
  onSelectRoute: (p: RouteProfile) => void;
  onBandCounts: (c: Record<RiskBand, number> | null) => void;
}

interface RoadTip {
  lat: number;
  lon: number;
  name: string;
  score: number;
  band: RiskBand;
}

function dropLayer(map: MLMap, id: string) {
  if (map.getLayer(id)) map.removeLayer(id);
}
function dropSource(map: MLMap, id: string) {
  if (map.getSource(id)) map.removeSource(id);
}

export default function FloodMap({
  origin,
  destination,
  routes,
  selected,
  rainfall,
  showRiskLayer,
  onMapClick,
  onSelectRoute,
  onBandCounts,
}: Props) {
  const mapRef = useRef<MapRef>(null);
  const [ready, setReady] = useState(false);
  const [mapObj, setMapObj] = useState<MLMap | null>(null);
  const [zoomedOut, setZoomedOut] = useState(false);
  const [tip, setTip] = useState<RoadTip | null>(null);
  const debounce = useRef<number>();

  const getMap = () => mapRef.current?.getMap() as MLMap | undefined;

  // ------------------------------------------------------------------
  // Risk overlay
  // ------------------------------------------------------------------

  const drawRisk = useCallback((fc: GeoJSON.FeatureCollection | null) => {
    const map = getMap();
    if (!map) return;

    // isStyleLoaded() reads false whenever raster tiles are in flight,
    // which is most of the time. Guarding on it and returning means the
    // draw silently never happens - so wait for the next idle and retry.
    if (!map.isStyleLoaded()) {
      map.once("idle", () => drawRisk(fc));
      return;
    }

    if (!fc) {
      dropLayer(map, BLOCKED_LAYER);
      dropLayer(map, RISK_LAYER);
      dropSource(map, RISK_SRC);
      return;
    }

    const src = map.getSource(RISK_SRC) as any;
    if (src) {
      src.setData(fc);
      return;
    }

    map.addSource(RISK_SRC, { type: "geojson", data: fc });

    map.addLayer({
      id: RISK_LAYER,
      type: "line",
      source: RISK_SRC,
      filter: ["<", ["get", "risk_score"], BLOCKED_THRESHOLD],
      paint: {
        "line-width": ["interpolate", ["linear"], ["zoom"], 12, 1.4, 17, 5],
        "line-opacity": 0.7,
        "line-color": [
          "match",
          ["get", "risk_band"],
          "low", BAND_COLOR.low,
          "moderate", BAND_COLOR.moderate,
          "high", BAND_COLOR.high,
          "#5c7079",
        ],
      },
    });

    map.addLayer({
      id: BLOCKED_LAYER,
      type: "line",
      source: RISK_SRC,
      filter: [">=", ["get", "risk_score"], BLOCKED_THRESHOLD],
      layout: { "line-cap": "round" },
      paint: {
        "line-width": ["interpolate", ["linear"], ["zoom"], 12, 3.5, 17, 9],
        "line-opacity": 0.95,
        "line-color": BLOCKED_COLOR,
      },
    });
  }, []);

  const refreshRisk = useCallback(
    (e?: ViewStateChangeEvent) => {
      const map = (e?.target as MLMap | undefined) ?? getMap();
      if (!map) return;

      if (!showRiskLayer) {
        drawRisk(null);
        onBandCounts(null);
        return;
      }

      window.clearTimeout(debounce.current);
      debounce.current = window.setTimeout(async () => {
        if (map.getZoom() < RISK_MIN_ZOOM) {
          setZoomedOut(true);
          drawRisk(null);
          onBandCounts(null);
          return;
        }
        setZoomedOut(false);
        const b = map.getBounds();
        try {
          const fc = await api.riskLayer(
            {
              minLat: b.getSouth(),
              minLon: b.getWest(),
              maxLat: b.getNorth(),
              maxLon: b.getEast(),
            },
            rainfall,
          );
          drawRisk(fc);

          const counts: Record<RiskBand, number> = { low: 0, moderate: 0, high: 0 };
          for (const f of fc.features) {
            const band = f.properties?.risk_band as RiskBand | undefined;
            if (band && band in counts) counts[band]++;
          }
          onBandCounts(counts);
        } catch (err) {
          console.warn("[FloodMap] risk layer fetch failed", err);
          drawRisk(null);
          onBandCounts(null);
        }
      }, 350);
    },
    [showRiskLayer, rainfall, onBandCounts, drawRisk],
  );

  useEffect(() => {
    if (ready) refreshRisk();
  }, [ready, showRiskLayer, rainfall, refreshRisk]);

  // ------------------------------------------------------------------
  // Route polylines
  // ------------------------------------------------------------------
  //
  // Routes are NOT drawn as MapLibre style layers. Every attempt to do
  // so - declarative <Source>/<Layer>, then imperative addSource /
  // addLayer - produced nothing on screen, while <Marker> worked
  // throughout. Markers are DOM; style layers go through the WebGL
  // canvas. So routes are drawn as an SVG overlay instead, using the
  // same DOM path that demonstrably works, with map.project() turning
  // lon/lat into screen pixels. See RouteOverlay below.

  /** Frame the route. */
  useEffect(() => {
    const route = routes?.[selected];
    const map = getMap();
    if (!route || !map) return;

    const coords = route.geojson?.geometry?.coordinates;
    if (!coords || coords.length < 2) return;

    let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of coords) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    map.fitBounds(
      [
        [minX, minY],
        [maxX, maxY],
      ],
      { padding: 100, duration: 900 },
    );
  }, [routes, selected]);

  // ------------------------------------------------------------------
  // Interaction
  // ------------------------------------------------------------------

  const handleClick = (e: MapMouseEvent) => {
    const map = getMap();
    if (!map) return;

    const ids = [BLOCKED_LAYER, RISK_LAYER].filter((id) => map.getLayer(id));
    const hits = ids.length ? map.queryRenderedFeatures(e.point, { layers: ids }) : [];
    const hit = hits[0];
    const layerId = hit?.layer?.id ?? "";

    if (layerId === RISK_LAYER || layerId === BLOCKED_LAYER) {
      const props = hit?.properties ?? {};
      setTip({
        lat: e.lngLat.lat,
        lon: e.lngLat.lng,
        name: String(props.road_name ?? "Unnamed road"),
        score: Number(props.risk_score ?? 0),
        band: (props.risk_band as RiskBand) ?? "low",
      });
      return;
    }

    setTip(null);
    onMapClick({ lat: e.lngLat.lat, lon: e.lngLat.lng });
  };

  return (
    <Map
      ref={mapRef}
      initialViewState={MUMBAI}
      mapStyle={STYLE}
      onLoad={(e) => {
        const m = e.target as MLMap;
        (window as unknown as { _map: MLMap })._map = m;
        setMapObj(m);
        setReady(true);
      }}
      onMoveEnd={refreshRisk}
      onClick={handleClick}
      cursor="crosshair"
      style={{ position: "absolute", inset: 0 }}
    >
      <RouteOverlay
        map={mapObj}
        routes={routes}
        selected={selected}
        onSelect={onSelectRoute}
      />

      {routes?.[selected].hotspots.map((h) => (
        <Marker
          key={`${h.road_name}-${h.lat}`}
          latitude={h.lat}
          longitude={h.lon}
          anchor="center"
        >
          <div
            title={`${h.road_name} — ${h.flood_probability}% flood probability`}
            className="h-4 w-4 rounded-full border-2"
            style={{
              borderColor: BAND_COLOR[h.severity],
              background: "rgba(11,18,21,0.9)",
              boxShadow: `0 0 0 5px ${BAND_COLOR[h.severity]}30`,
            }}
          />
        </Marker>
      ))}

      {origin && (
        <Marker latitude={origin.lat} longitude={origin.lon} anchor="bottom">
          <Pin color="#2563eb" label="Source" />
        </Marker>
      )}
      {destination && (
        <Marker latitude={destination.lat} longitude={destination.lon} anchor="bottom">
          <Pin color="#f4f7f8" label="Destination" />
        </Marker>
      )}

      {tip && (
        <Popup
          latitude={tip.lat}
          longitude={tip.lon}
          anchor="bottom"
          onClose={() => setTip(null)}
          closeButton={false}
        >
          <div className="min-w-[9rem] text-[#0b1215]">
            <div className="text-[0.8rem] font-semibold">{tip.name}</div>
            <div className="text-[0.72rem]">
              Flood risk {tip.score}/100 · {tip.band}
            </div>
            {tip.score >= BLOCKED_THRESHOLD && (
              <div
                className="mt-1 text-[0.72rem] font-semibold"
                style={{ color: BLOCKED_COLOR }}
              >
                Likely impassable
              </div>
            )}
          </div>
        </Popup>
      )}

      {routes && (
        <div className="pointer-events-none absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-3 rounded-full border border-hairline bg-ink/85 px-4 py-2 backdrop-blur">
          {DRAW_ORDER.map((p) => (
            <span key={p} className="flex items-center gap-1.5 text-[0.72rem]">
              <span
                className="h-1 w-5 rounded-full"
                style={{ background: PROFILE_COLOR[p] }}
              />
              <span style={{ color: p === selected ? "#e8eef0" : "#8fa3ac" }}>
                {PROFILE_LABEL[p]}
              </span>
            </span>
          ))}
        </div>
      )}

      {showRiskLayer && zoomedOut && (
        <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full border border-hairline bg-ink/85 px-3.5 py-1.5 text-[0.75rem] text-muted backdrop-blur">
          Zoom in to colour roads by flood risk
        </div>
      )}
    </Map>
  );
}

/**
 * RouteOverlay
 * Draws the three routes as an SVG layer sitting on top of the map
 * canvas, rather than as MapLibre line layers.
 *
 * Each lon/lat is converted to a screen pixel with map.project(), and
 * the whole thing is recomputed on move / zoom / resize so the lines
 * stay pinned to the ground. That is more work per frame than a style
 * layer, but a few hundred points across three routes is nothing, and
 * it renders through the DOM - the one path in this component that has
 * worked consistently.
 *
 * Each route is drawn twice: a white casing underneath, then the
 * coloured line over it, which is how navigation apps keep a route
 * legible against arbitrary map content.
 */
function RouteOverlay({
  map,
  routes,
  selected,
  onSelect,
}: {
  map: MLMap | null;
  routes: Record<RouteProfile, Route> | null;
  selected: RouteProfile;
  onSelect: (p: RouteProfile) => void;
}) {
  const [, bump] = useState(0);

  useEffect(() => {
    if (!map) return;
    const rerender = () => bump((n) => n + 1);
    map.on("move", rerender);
    map.on("zoom", rerender);
    map.on("rotate", rerender);
    map.on("resize", rerender);
    rerender();
    return () => {
      map.off("move", rerender);
      map.off("zoom", rerender);
      map.off("rotate", rerender);
      map.off("resize", rerender);
    };
  }, [map]);

  if (!map || !routes) return null;

  const toPath = (coords: GeoJSON.Position[]) => {
    let d = "";
    for (let i = 0; i < coords.length; i++) {
      const pt = map.project([coords[i][0], coords[i][1]]);
      d += `${i === 0 ? "M" : "L"}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
    }
    return d;
  };

  // Unselected first so the active route lands on top.
  const order = DRAW_ORDER.filter((p) => p !== selected).concat(selected);

  return (
    <svg
      className="absolute inset-0 h-full w-full"
      style={{ pointerEvents: "none", zIndex: 1 }}
    >
      {order.map((profile) => {
        const coords = routes[profile]?.geojson?.geometry?.coordinates;
        if (!coords || coords.length < 2) return null;
        const d = toPath(coords);
        const active = profile === selected;
        return (
          <g key={profile}>
            <path
              d={d}
              fill="none"
              stroke="#ffffff"
              strokeWidth={active ? 13 : 10}
              strokeOpacity={active ? 0.95 : 0.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Dashed for the danger route, so it never reads as
                something you might follow - a solid line implies a
                suggestion. */}
            <path
              d={d}
              fill="none"
              strokeDasharray={profile === "danger" ? "14 9" : undefined}
              stroke={PROFILE_COLOR[profile]}
              strokeWidth={active ? 9 : 6}
              strokeOpacity={active ? 1 : 0.7}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ pointerEvents: "stroke", cursor: "pointer" }}
              onClick={() => onSelect(profile)}
            />
          </g>
        );
      })}
    </svg>
  );
}

function Pin({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex flex-col items-center" aria-label={label}>
      <svg width="28" height="36" viewBox="0 0 26 34" fill="none">
        <path
          d="M13 33C13 33 25 21.5 25 13A12 12 0 1 0 1 13c0 8.5 12 20 12 20Z"
          fill={color}
          stroke="#08111a"
          strokeWidth="2"
        />
        <circle cx="13" cy="13" r="4.5" fill="#08111a" />
      </svg>
    </div>
  );
}