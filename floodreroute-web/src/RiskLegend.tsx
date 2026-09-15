/**
 * RiskLegend.tsx
 * Reads the colours on the map.
 *
 * Bands match the proposal's classification (Low 0–30, Moderate 31–60,
 * High 61–100) and the colours are IMD's warning palette, so the
 * severity language lines up with what people already see on the news.
 *
 * The count column is the honest part: it shows how many segments in
 * the current view actually fall in each band. Without it a legend
 * implies an even spread, and right now most of Mumbai sits in the
 * moderate band with very few segments above 60.
 */

import { BAND_COLOR, type RiskBand } from "./api";

const BANDS: { key: RiskBand; label: string; range: string }[] = [
  { key: "low", label: "Low", range: "0–30" },
  { key: "moderate", label: "Moderate", range: "31–60" },
  { key: "high", label: "High", range: "61–100" },
];

export default function RiskLegend({
  counts,
}: {
  counts?: Record<RiskBand, number> | null;
}) {
  const total = counts
    ? counts.low + counts.moderate + counts.high
    : 0;

  return (
    <div className="space-y-1.5">
      <span className="eyebrow">Flood risk</span>
      <ul className="space-y-1">
        {BANDS.map((b) => {
          const n = counts?.[b.key] ?? 0;
          const pct = total ? (n / total) * 100 : 0;
          return (
            <li key={b.key} className="flex items-center gap-2.5">
              <span
                className="h-1 w-6 shrink-0 rounded-full"
                style={{ background: BAND_COLOR[b.key] }}
                aria-hidden
              />
              <span className="text-[0.78rem] text-muted">{b.label}</span>
              <span className="figure text-[0.7rem] text-faint">{b.range}</span>

              {counts && (
                <span className="ml-auto flex items-center gap-2">
                  {/* Proportion bar - shows the real distribution in view */}
                  <span className="h-1 w-12 overflow-hidden rounded-full bg-hairline">
                    <span
                      className="block h-full rounded-full transition-[width] duration-500"
                      style={{ width: `${pct}%`, background: BAND_COLOR[b.key] }}
                    />
                  </span>
                  <span className="figure w-9 text-right text-[0.7rem] text-faint">
                    {pct >= 1 ? `${pct.toFixed(0)}%` : "<1%"}
                  </span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {counts && total > 0 && (
        <p className="figure text-[0.68rem] text-faint">
          {total.toLocaleString()} segments in view
        </p>
      )}
    </div>
  );
}
