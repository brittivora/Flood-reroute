/**
 * api.ts
 * Typed client for the FloodReroute FastAPI backend.
 *
 * Every shape here mirrors what main.py actually returns - if you
 * change a response there, change it here and TypeScript will point
 * you at each call site that needs updating.
 */

const BASE = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

export type RainfallLevel = "light" | "moderate" | "heavy" | "extreme";
export type RouteProfile = "danger" | "fastest" | "safest";
export type RiskBand = "low" | "moderate" | "high";

export interface Hotspot {
  road_name: string;
  risk: number;
  flood_probability: number; // 0-100
  severity: RiskBand;
  lat: number;
  lon: number;
  length_m: number;
}

export interface Route {
  profile: RouteProfile;
  /** True for the deliberately flood-prone route - never recommend it. */
  avoid: boolean;
  distance_km: number;
  eta_min: number;
  delay_min: number;
  risk_score: number; // 0-100
  risk_band: RiskBand;
  hotspot_count: number;
  hotspots: Hotspot[];
  /** 100 - risk_score. Reads better than risk on a card. */
  safety_score: number;
  /** Hotspots on the danger route that this route misses. */
  hotspots_avoided: number;
  geojson: GeoJSON.Feature<GeoJSON.LineString>;
}

export interface RoutesResponse {
  routes: Record<RouteProfile, Route>;
  rainfall_mm_hr: number;
}

export interface RecommendResponse extends RoutesResponse {
  recommended: RouteProfile;
  message: string;
  extreme_conditions: boolean;
}

export interface Conditions {
  rainfall_mm_hr: number;
  rainfall_presets: Record<RainfallLevel, number>;
  /** Which risk factors have data loaded. Surfacing this honestly
   *  beats implying a five-factor model when two are empty. */
  active_factors: Record<string, boolean>;
}

export interface LatLon {
  lat: number;
  lon: number;
}

/** One geocoding candidate from /geocode/suggest. */
export interface Suggestion {
  name: string;
  context: string;
  lat: number;
  lon: number;
  kind: string;
  source: string;
}

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    // Distinguish "server is down" from "server said no" - the fixes
    // are completely different and the user should be told which.
    throw new ApiError(0, "Can't reach the routing server. Is it running?");
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail);
  }
  return res.json();
}

export const api = {
  health: () => request<{ status: string; nodes: number; edges: number }>("/health"),

  conditions: () => request<Conditions>("/current-conditions"),

  geocode: (address: string) =>
    request<Suggestion>("/geocode", {
      method: "POST",
      body: JSON.stringify({ address }),
    }),

  /** Type-ahead candidates. Called per keystroke, so it is debounced
   *  at the component and served from Photon only on the backend. */
  suggest: async (q: string, limit = 6) => {
    const p = new URLSearchParams({ q, limit: String(limit) });
    const r = await request<{ results: Suggestion[] }>(`/geocode/suggest?${p}`);
    return r.results;
  },

  /** All three route options plus the recommendation logic. */
  recommend: (origin: LatLon, dest: LatLon, rainfall_level?: RainfallLevel) =>
    request<RecommendResponse>("/recommend", {
      method: "POST",
      body: JSON.stringify({
        origin_lat: origin.lat,
        origin_lon: origin.lon,
        dest_lat: dest.lat,
        dest_lon: dest.lon,
        rainfall_level,
      }),
    }),

  /** Risk-coloured segments for the visible map area. The backend
   *  requires a bbox - requesting the whole city would return a
   *  quarter-million features. */
  riskLayer: (
    b: { minLat: number; minLon: number; maxLat: number; maxLon: number },
    rainfall_level?: RainfallLevel,
  ) => {
    const q = new URLSearchParams({
      min_lat: String(b.minLat),
      min_lon: String(b.minLon),
      max_lat: String(b.maxLat),
      max_lon: String(b.maxLon),
    });
    if (rainfall_level) q.set("rainfall_level", rainfall_level);
    return request<GeoJSON.FeatureCollection>(`/risk?${q}`);
  },
};

export { ApiError };

/** Road-segment risk colours, distinct from route colours below so a
 *  route line is never confused with a road-risk shade. */
export const BAND_COLOR: Record<RiskBand, string> = {
  low: "#14532d",      // deep green, recedes
  moderate: "#ca8a04", // amber
  high: "#dc2626",     // red - danger zone
};

/** Segments at or above this score are drawn as impassable. */
export const BLOCKED_COLOR = "#7f1d1d";
export const BLOCKED_THRESHOLD = 80;

/** Route identity colours. Safest reads blue because blue is the
 *  "recommended" convention in every navigation app. */
export const PROFILE_COLOR: Record<RouteProfile, string> = {
  safest: "#3b82f6",  // blue   - recommended
  fastest: "#f97316", // orange - shortest
  danger: "#dc2626",  // red    - do not take
};

export const PROFILE_LABEL: Record<RouteProfile, string> = {
  danger: "Avoid",
  fastest: "Fastest",
  safest: "Safest",
};