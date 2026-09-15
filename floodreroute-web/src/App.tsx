/**
 * App.tsx
 * Wires the panel to the map and the backend.
 *
 * Pin-drop: first map tap sets pickup, second sets drop-off, third
 * starts over. Typed addresses resolve through the autocomplete, so a
 * user can mix the two - pick an origin from the dropdown, tap a
 * destination on the map.
 */

import { useCallback, useEffect, useState } from "react";
import FloodMap from "./FloodMap";
import RoutePanel from "./RoutePanel";
import {
  api,
  ApiError,
  type Conditions,
  type LatLon,
  type RainfallLevel,
  type RecommendResponse,
  type RiskBand,
  type RouteProfile,
  type Suggestion,
} from "./api";

export default function App() {
  const [originText, setOriginText] = useState("");
  const [destText, setDestText] = useState("");
  const [origin, setOrigin] = useState<LatLon | null>(null);
  const [destination, setDestination] = useState<LatLon | null>(null);

  const [rainfall, setRainfall] = useState<RainfallLevel>("moderate");
  const [result, setResult] = useState<RecommendResponse | null>(null);
  const [selected, setSelected] = useState<RouteProfile>("safest");
  const [conditions, setConditions] = useState<Conditions | null>(null);
  const [showRiskLayer, setShowRiskLayer] = useState(true);
  const [bandCounts, setBandCounts] = useState<Record<RiskBand, number> | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.conditions().then(setConditions).catch(() => setConditions(null));
  }, []);

  const fmt = (v: LatLon) => `${v.lat.toFixed(5)}, ${v.lon.toFixed(5)}`;

  const handleMapClick = useCallback(
    (p: LatLon) => {
      if (!origin || (origin && destination)) {
        setOrigin(p);
        setOriginText(fmt(p));
        setDestination(null);
        setDestText("");
        setResult(null);
      } else {
        setDestination(p);
        setDestText(fmt(p));
      }
    },
    [origin, destination],
  );

  // Picking from the dropdown fixes the coordinate immediately, so no
  // geocoding round-trip is needed at submit time.
  const pickOrigin = (s: Suggestion) => setOrigin({ lat: s.lat, lon: s.lon });
  const pickDest = (s: Suggestion) => setDestination({ lat: s.lat, lon: s.lon });

  /** Text already in "lat, lon" form skips the geocoder - that's what
   *  a dropped pin writes into the field. */
  const resolve = async (text: string, existing: LatLon | null) => {
    const m = text.trim().match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
    if (m) return { lat: parseFloat(m[1]), lon: parseFloat(m[2]) };
    if (existing) return existing;
    if (!text.trim()) return null;
    const p = await api.geocode(text);
    return { lat: p.lat, lon: p.lon };
  };

  const findRoutes = async () => {
    setError(null);
    setLoading(true);
    try {
      const o = await resolve(originText, origin);
      const d = await resolve(destText, destination);
      if (!o || !d) {
        setError("Set both a pickup and a drop-off.");
        return;
      }
      setOrigin(o);
      setDestination(d);

      const res = await api.recommend(o, d, rainfall);
      setResult(res);
      setSelected(res.recommended);
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Something went wrong finding routes.",
      );
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  // Rainfall is the whole point of the control, so changing it
  // recomputes - but only once a route exists to recompute.
  useEffect(() => {
    if (!origin || !destination || !result) return;
    let cancelled = false;
    api
      .recommend(origin, destination, rainfall)
      .then((res) => {
        if (cancelled) return;
        setResult(res);
        setSelected(res.recommended);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rainfall]);

  return (
    <div className="flex h-dvh flex-col-reverse md:flex-row">
      <div className="h-[55dvh] shrink-0 md:h-full md:w-auto">
        <RoutePanel
          origin={originText}
          destination={destText}
          rainfall={rainfall}
          result={result}
          selected={selected}
          loading={loading}
          error={error}
          conditions={conditions}
          showRiskLayer={showRiskLayer}
          bandCounts={bandCounts}
          onOriginChange={setOriginText}
          onDestinationChange={setDestText}
          onOriginPick={pickOrigin}
          onDestinationPick={pickDest}
          onRainfallChange={setRainfall}
          onSelect={setSelected}
          onSubmit={findRoutes}
          onToggleRiskLayer={setShowRiskLayer}
        />
      </div>

      <main className="relative flex-1">
        <FloodMap
          origin={origin}
          destination={destination}
          routes={result?.routes ?? null}
          selected={selected}
          rainfall={rainfall}
          showRiskLayer={showRiskLayer}
          onMapClick={handleMapClick}
          onSelectRoute={setSelected}
          onBandCounts={setBandCounts}
        />
      </main>
    </div>
  );
}