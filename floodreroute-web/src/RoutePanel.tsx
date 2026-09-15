/**
 * RoutePanel.tsx
 * The left-hand control surface: where you're going, what the weather
 * is doing, and the three route options.
 *
 * The route cards carry the design's one bold move - a waterline that
 * rises through the card in proportion to flood risk. Risk is not a
 * bar chart here; it's water level, which is what the number means.
 */

import AddressInput from "./AddressInput";
import RiskLegend from "./RiskLegend";
import {
  BAND_COLOR,
  PROFILE_COLOR,
  PROFILE_LABEL,
  type Conditions,
  type RainfallLevel,
  type RecommendResponse,
  type RiskBand,
  type Route,
  type RouteProfile,
  type Suggestion,
} from "./api";

const RAIN_LEVELS: { key: RainfallLevel; label: string; note: string }[] = [
  { key: "light", label: "Light", note: "under 5 mm/hr" },
  { key: "moderate", label: "Moderate", note: "5–15 mm/hr" },
  { key: "heavy", label: "Heavy", note: "over 15 mm/hr" },
  { key: "extreme", label: "Extreme", note: "deluge" },
];

interface Props {
  origin: string;
  destination: string;
  rainfall: RainfallLevel;
  result: RecommendResponse | null;
  selected: RouteProfile;
  loading: boolean;
  error: string | null;
  conditions: Conditions | null;
  showRiskLayer: boolean;
  bandCounts: Record<RiskBand, number> | null;
  onOriginChange: (v: string) => void;
  onDestinationChange: (v: string) => void;
  onOriginPick: (p: Suggestion) => void;
  onDestinationPick: (p: Suggestion) => void;
  onRainfallChange: (v: RainfallLevel) => void;
  onSelect: (p: RouteProfile) => void;
  onSubmit: () => void;
  onToggleRiskLayer: (v: boolean) => void;
}

export default function RoutePanel(p: Props) {
  const routes = p.result?.routes;
  // Safest first: the recommendation should be the first thing read,
  // and the route to avoid the last.
  const order: RouteProfile[] = ["safest", "fastest", "danger"];

  return (
    <aside className="flex h-full w-full flex-col gap-5 overflow-y-auto bg-surface/95 p-5 backdrop-blur-xl md:w-[380px] md:border-r md:border-hairline">
      <header>
        <h1 className="text-[1.35rem] font-semibold tracking-tight">FloodReroute</h1>
        <p className="mt-0.5 text-[0.8rem] text-muted">Monsoon routing for Mumbai</p>
      </header>

      <section className="space-y-2">
        <AddressInput
          label="Pickup"
          value={p.origin}
          onChange={p.onOriginChange}
          onSelect={p.onOriginPick}
          placeholder="Building, society, or area…"
          dot="#3b82f6"
        />
        <AddressInput
          label="Drop-off"
          value={p.destination}
          onChange={p.onDestinationChange}
          onSelect={p.onDestinationPick}
          placeholder="Where to?"
          dot="#e8eef0"
        />
        <p className="pt-1 text-[0.72rem] text-faint">
          Or tap the map to drop a pin.
        </p>
      </section>

      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="eyebrow">Rainfall</span>
          {p.conditions && (
            <span className="figure text-[0.72rem] text-faint">
              live {p.conditions.rainfall_mm_hr.toFixed(1)} mm/hr
            </span>
          )}
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {RAIN_LEVELS.map((l) => {
            const on = p.rainfall === l.key;
            return (
              <button
                key={l.key}
                onClick={() => p.onRainfallChange(l.key)}
                title={l.note}
                aria-pressed={on}
                className={`rounded-lg border px-1 py-2 text-[0.72rem] font-medium transition-colors ${
                  on
                    ? "border-signal bg-signal/15 text-text"
                    : "border-hairline text-muted hover:border-faint hover:text-text"
                }`}
              >
                {l.label}
              </button>
            );
          })}
        </div>
        <p className="text-[0.68rem] text-faint">
          Bands follow IMD nowcast thresholds.
        </p>
      </section>

      <button
        onClick={p.onSubmit}
        disabled={p.loading}
        className="rounded-xl bg-signal px-4 py-3 text-[0.9rem] font-semibold text-ink transition-opacity disabled:opacity-50"
      >
        {p.loading ? "Finding routes…" : "Find routes"}
      </button>

      {p.error && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2.5 text-[0.8rem] text-text">
          {p.error}
        </div>
      )}

      {p.result && (
        <div
          className="rounded-xl border px-3.5 py-3 text-[0.82rem] leading-relaxed"
          style={{
            borderColor: `${PROFILE_COLOR[p.result.recommended]}55`,
            background: `${PROFILE_COLOR[p.result.recommended]}12`,
          }}
        >
          <div className="eyebrow mb-1">
            {p.result.extreme_conditions ? "Extreme rainfall" : "Recommended"}
          </div>
          {p.result.message}
        </div>
      )}

      {routes && (
        <section className="space-y-2.5">
          {order.map((profile) => (
            <RouteCard
              key={profile}
              route={routes[profile]}
              selected={p.selected === profile}
              recommended={p.result?.recommended === profile}
              onSelect={() => p.onSelect(profile)}
            />
          ))}
        </section>
      )}

      {routes && (
        <section className="space-y-1.5">
          <span className="eyebrow">Likely flooded on this route</span>
          {routes[p.selected].hotspots.length > 0 ? (
            <ul className="space-y-1">
              {routes[p.selected].hotspots.map((h) => (
                <li
                  key={`${h.road_name}-${h.lat}`}
                  className="flex items-center justify-between gap-3 border-b border-hairline/60 py-1.5 text-[0.8rem] last:border-0"
                >
                  <span className="truncate text-muted">{h.road_name}</span>
                  <span
                    className="figure shrink-0 text-[0.78rem]"
                    style={{ color: BAND_COLOR[h.severity] }}
                  >
                    {h.flood_probability}%
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            /* An empty list needs to say why. Silence here reads as a
               loading failure rather than as good news. */
            <p className="text-[0.76rem] leading-relaxed text-faint">
              No segment on this route scores above 60. That is the whole
              route, not a data gap.
            </p>
          )}
        </section>
      )}

      <section className="mt-auto space-y-3 border-t border-hairline pt-4">
        <label className="flex cursor-pointer items-center gap-2.5 text-[0.8rem] text-muted">
          <input
            type="checkbox"
            checked={p.showRiskLayer}
            onChange={(e) => p.onToggleRiskLayer(e.target.checked)}
            className="accent-signal"
          />
          Flood risk overlay
          <span className="text-[0.7rem] text-faint">(zoom in)</span>
        </label>

        {p.showRiskLayer && <RiskLegend counts={p.bandCounts} />}

        {p.conditions && <FactorStatus factors={p.conditions.active_factors} />}
      </section>
    </aside>
  );
}

/** Honest reporting of which risk factors have data behind them.
 *  Showing a five-factor model when some are empty would overstate
 *  what the score knows. */
function FactorStatus({ factors }: { factors: Record<string, boolean> }) {
  const missing = Object.entries(factors)
    .filter(([, on]) => !on)
    .map(([k]) => k);
  if (!missing.length) return null;
  return (
    <p className="text-[0.7rem] leading-relaxed text-faint">
      Scoring without {missing.join(" and ")} data — those layers aren't loaded
      yet.
    </p>
  );
}

function RouteCard({
  route,
  selected,
  recommended,
  onSelect,
}: {
  route: Route;
  selected: boolean;
  recommended: boolean;
  onSelect: () => void;
}) {
  const color = PROFILE_COLOR[route.profile];
  const band = BAND_COLOR[route.risk_band];

  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      className={`relative w-full overflow-hidden rounded-xl border px-3.5 py-3 text-left transition-colors ${
        selected ? "border-transparent bg-raised" : "border-hairline hover:border-faint"
      }`}
      style={selected ? { boxShadow: `inset 0 0 0 1.5px ${color}` } : undefined}
    >
      {/* The waterline: fill height = flood risk score. */}
      <div
        className="waterline"
        style={{ height: `${route.risk_score}%`, background: band }}
        aria-hidden
      />

      <div className="relative flex items-baseline justify-between gap-2">
        <span className="text-[0.9rem] font-semibold" style={{ color }}>
          {PROFILE_LABEL[route.profile]}
        </span>
        {route.avoid ? (
          <span className="eyebrow" style={{ color }}>
            Do not take
          </span>
        ) : recommended ? (
          <span className="eyebrow" style={{ color }}>
            Recommended
          </span>
        ) : null}
      </div>

      <div className="relative mt-2 flex items-baseline gap-4">
        <Metric value={route.eta_min.toFixed(0)} unit="min" />
        <Metric value={route.distance_km.toFixed(1)} unit="km" />
        {/* Safety reads better than risk on everything except the
            route you are being told to avoid, where the risk number
            is the whole point. */}
        {route.avoid ? (
          <Metric value={String(route.risk_score)} unit="risk" color={band} />
        ) : (
          <Metric value={`${route.safety_score}%`} unit="safe" color={band} />
        )}
      </div>

      <div className="relative mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.72rem] text-muted">
        <span>
          {route.hotspot_count === 0
            ? "No flood hotspots"
            : `${route.hotspot_count} flood hotspot${route.hotspot_count > 1 ? "s" : ""}`}
        </span>
        {!route.avoid && route.hotspots_avoided > 0 && (
          <span style={{ color: "#22c55e" }}>
            avoids {route.hotspots_avoided}
          </span>
        )}
        {route.delay_min > 0 && (
          <span className="figure text-faint">+{route.delay_min.toFixed(0)} min</span>
        )}
      </div>
    </button>
  );
}

function Metric({
  value,
  unit,
  color,
}: {
  value: string;
  unit: string;
  color?: string;
}) {
  return (
    <div className="flex items-baseline gap-1">
      <span
        className="figure text-[1.25rem] font-medium"
        style={color ? { color } : undefined}
      >
        {value}
      </span>
      <span className="text-[0.7rem] text-faint">{unit}</span>
    </div>
  );
}