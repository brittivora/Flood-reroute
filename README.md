# FloodReroute

**A Flood-Risk-Aware Intelligent Routing System for Mumbai**

Standard navigation optimises for distance and traffic — it has no concept of whether a road is submerged or about to become so. FloodReroute assigns a flood-risk score to every road segment in the Mumbai metropolitan network and computes routes that minimise exposure to high-risk roads, not just travel time.

Built entirely on free, openly licensed data. No paid APIs, no synthetic values.

## What it does

- Scores every road segment 0–100 on flood risk, combining elevation, drainage, historical flooding, waterlogging reports, and live rainfall
- Computes three risk-weighted routes (Safest / Fastest / Avoid) via A* search
- Serves scores and routes through a FastAPI backend
- Visualises risk-colored roads and routes on an interactive web map

## Stats

- 101,907-node road graph, 235,788 edges (OSMnx / OpenStreetMap)
- Five-factor rule-based risk model (not yet ML — see Limitations)
- 27 documented chronic waterlogging locations
- Validated on the Powai–Dadar corridor: Safest route scores 36/100 with zero flood hotspots vs. Fastest's 43/100 with one hotspot, for 1.7 extra minutes

## Tech stack

| Layer | Tech |
|---|---|
| Backend / API | FastAPI |
| Routing | Risk-weighted A* over an 8-connected spatial graph |
| Frontend | React, TypeScript, MapLibre |
| Data processing | Python (GeoPandas, Rasterio, etc.) |

## Data sources

| Layer | Source |
|---|---|
| Road network | OpenStreetMap via OSMnx |
| Elevation | ISRO CartoDEM (Cartosat-1) + NASA SRTM (30m) |
| Flood history | Sentinel-1 SAR via Google Earth Engine |
| Drainage proxy | Terrain slope + OSM watercourses |
| Waterlogging | Documented chronic flooding locations (compiled from published reporting) |
| Rainfall | IMD nowcast API, Open-Meteo fallback |

## Risk model

Risk is computed per segment on a 0–100 scale, split into a slow-changing base risk and a live rainfall term so rainfall updates don't require rescoring the whole graph:

```
base_risk(n)  = Σ w_i × factor_i(n) / Σ w_i      (weighted sum, renormalised over available factors)
risk          = 0.85 × base_risk + 0.15 × rain_norm
score         = round(risk × 100)
```

**Factor weights:** Elevation 30% · Drainage 25% · Historical flooding 20% · Rainfall intensity 15% · Waterlogging reports 10%

## Routing

Edge cost is distance multiplied by a risk penalty:

```
cost(u,v) = max(length × (1 + α × risk), length × 0.05)
```

| Route | α | Behaviour |
|---|---|---|
| Safest | 6.0 | Max-risk road costs 7× its true length |
| Fastest | 0.0 | Pure shortest path, risk ignored |
| Avoid | −0.7 | Cost inverted — seeks flood-prone roads (diagnostic only, never recommended to users) |

## Known limitations

- **Waterlogging layer** covers ~5% (27/496) of BMC's documented chronic spots, and doesn't model remediation — a fixed location may still read as risky
- **Drainage factor** is a proxy (slope + watercourse proximity), not actual stormwater infrastructure data
- **Risk scores are rankings, not probabilities** — not calibrated against observed outcomes
- **No official road-closure feed** — segments >80 display as "predicted impassable," a model output, not an advisory
- **30m DEM resolution** can't resolve street-scale depressions (e.g. Hindmata reads as unremarkable despite flooding to waist height)
- **Travel times are free-flow estimates** with no congestion model

## Roadmap

1. **Immediate** — Per-event SAR label extraction (training data for any supervised model)
2. **Near term** — Full 496-spot BMC waterlogging register; gradient-boosted (XGBoost) risk model with SHAP analysis
3. **Medium term** — Extend SAR history to 40+ events; spatiotemporal forecasting (risk 1–6 hrs ahead)
4. **Longer term** — City-agnostic retargeting (Chennai, Kolkata, Dhaka, etc.)
