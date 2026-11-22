import { REGIONS } from "@/lib/courses";
import {
  classifyCourseStatus,
  type StationSummary,
  type TrafficStatus,
} from "@/lib/csvParser";
import type { RegressionModelMetrics } from "@/lib/inversionModel";

export interface RoutePoint {
  lat: number;
  lon: number;
  label?: string;
}

export interface PlaceSearchResult {
  label: string;
  shortLabel: string;
  lat: number;
  lon: number;
}

export interface CustomRouteSegment {
  index: number;
  label: string;
  coordinates: [number, number][];
  elevationM: number;
  elevationDeltaM: number;
  exposureFactor: number;
  windFactor: number;
  terrainNote: string;
  hourlyPm25: Record<number, number>;
}

export interface CustomRouteHourPoint {
  hour: number;
  pm25: number;
  wind: number | null;
  temp: number | null;
}

export interface CustomRouteAnalysis {
  id: string;
  name: string;
  startPoint: RoutePoint;
  endPoint: RoutePoint;
  distanceKm: number;
  runningMinutes: number;
  walkingMinutes: number;
  routingSource: "osrm-foot" | "osrm-fallback" | "direct-fallback";
  dataSource: "open-meteo-live" | "nearest-station-fallback";
  referenceLabel: string;
  apiCallsUsed: number;
  fetchedAt: string;
  coordinates: [number, number][];
  elevationsM: number[];
  minElevationM: number;
  maxElevationM: number;
  elevationGainM: number;
  avgElevationM: number;
  segments: CustomRouteSegment[];
  hourlySeries: CustomRouteHourPoint[];
  pm14: number;
  pm22: number;
  diff: number;
  wind22: number | null;
  tempDrop: number;
  isInversion: boolean;
  predictedPm22: number;
  inversionProbPct: number;
  topFactor: string;
  bestHour: number;
  exposureFactor: number;
  terrainSummary: string;
}

export interface CustomRouteAtHourView {
  pmAtHour: number;
  windAtHour: number | null;
  tempAtHour: number | null;
  status: TrafficStatus;
  cigaretteEq: number;
  segmentViews: Array<
    CustomRouteSegment & {
      pmAtHour: number;
      status: TrafficStatus;
    }
  >;
}

interface OpenMeteoAirHourly {
  hourly?: {
    time?: string[];
    pm2_5?: (number | null)[];
  };
}

interface OpenMeteoWeatherHourly {
  hourly?: {
    time?: string[];
    wind_speed_10m?: (number | null)[];
    temperature_2m?: (number | null)[];
  };
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

export function haversineKm(a: [number, number], b: [number, number]): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function computePathDistanceKm(coords: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversineKm(coords[i - 1], coords[i]);
  }
  return Math.round(total * 100) / 100;
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 6500): Promise<T> {
  const controller = new AbortController();
  const id = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    window.clearTimeout(id);
  }
}

export async function searchKoreanPlaces(
  query: string
): Promise<PlaceSearchResult[]> {
  const clean = query.trim();
  if (!clean) return [];

  const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=kr&limit=5&accept-language=ko&q=${encodeURIComponent(
    clean
  )}`;
  const rows = await fetchJsonWithTimeout<
    Array<{
      display_name?: string;
      name?: string;
      lat?: string;
      lon?: string;
    }>
  >(url, 5500);

  return rows
    .map((r): PlaceSearchResult | null => {
      const lat = Number(r.lat);
      const lon = Number(r.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      const display = r.display_name || clean;
      const parts = display
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const shortLabel =
        r.name?.trim() || parts.slice(0, 2).join(" ") || clean;
      return {
        label: display,
        shortLabel,
        lat: Math.round(lat * 100000) / 100000,
        lon: Math.round(lon * 100000) / 100000,
      };
    })
    .filter((v): v is PlaceSearchResult => v !== null);
}

interface OsrmRouteResponse {
  code?: string;
  routes?: Array<{
    distance?: number;
    duration?: number;
    geometry?: {
      coordinates?: [number, number][];
    };
  }>;
}

async function fetchWalkingRoute(
  start: RoutePoint,
  end: RoutePoint
): Promise<{
  coordinates: [number, number][];
  distanceKm: number;
  routingSource: "osrm-foot" | "osrm-fallback" | "direct-fallback";
  callsUsed: number;
}> {
  const endpoints: Array<{
    url: string;
    source: "osrm-foot" | "osrm-fallback";
  }> = [
    {
      url: `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${start.lon},${start.lat};${end.lon},${end.lat}?overview=full&geometries=geojson`,
      source: "osrm-foot",
    },
    {
      url: `https://router.project-osrm.org/route/v1/foot/${start.lon},${start.lat};${end.lon},${end.lat}?overview=full&geometries=geojson`,
      source: "osrm-fallback",
    },
  ];

  let callsUsed = 0;
  for (const ep of endpoints) {
    callsUsed += 1;
    try {
      const data = await fetchJsonWithTimeout<OsrmRouteResponse>(ep.url, 6500);
      const route = data.routes?.[0];
      const rawCoords = route?.geometry?.coordinates;
      if (rawCoords && rawCoords.length >= 2) {
        const coords: [number, number][] = rawCoords.map(([lon, lat]) => [
          lat,
          lon,
        ]);
        const distanceKm =
          typeof route?.distance === "number" && route.distance > 0
            ? Math.round((route.distance / 1000) * 100) / 100
            : computePathDistanceKm(coords);
        return {
          coordinates: coords,
          distanceKm: Math.max(0.1, distanceKm),
          routingSource: ep.source,
          callsUsed,
        };
      }
    } catch {
      continue;
    }
  }

  // Fallback: straight 9-point interpolation so UI stays responsive even offline
  const steps = 8;
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    coords.push([
      start.lat + (end.lat - start.lat) * t,
      start.lon + (end.lon - start.lon) * t,
    ]);
  }
  const distanceKm = Math.max(
    0.1,
    haversineKm([start.lat, start.lon], [end.lat, end.lon])
  );
  return {
    coordinates: coords,
    distanceKm: Math.round(distanceKm * 100) / 100,
    routingSource: "direct-fallback",
    callsUsed,
  };
}

function sampleRouteIndices(
  coords: [number, number][],
  targetPoints = 5
): number[] {
  if (coords.length <= 2) return coords.map((_, i) => i);
  const count = Math.min(targetPoints, coords.length);
  const cumDist: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    cumDist.push(cumDist[i - 1] + haversineKm(coords[i - 1], coords[i]));
  }
  const totalDist = cumDist[cumDist.length - 1];
  if (totalDist <= 0.001) {
    return Array.from({ length: count }, (_, i) =>
      Math.round((i * (coords.length - 1)) / (count - 1))
    );
  }

  const indices: number[] = [0];
  for (let k = 1; k < count - 1; k++) {
    const target = (totalDist * k) / (count - 1);
    let bestIdx = indices[indices.length - 1] + 1;
    let bestDiff = Infinity;
    for (let i = bestIdx; i < coords.length - 1; i++) {
      const d = Math.abs(cumDist[i] - target);
      if (d < bestDiff) {
        bestDiff = d;
        bestIdx = i;
      }
    }
    if (bestIdx > indices[indices.length - 1] && bestIdx < coords.length - 1) {
      indices.push(bestIdx);
    }
  }
  indices.push(coords.length - 1);
  return Array.from(new Set(indices)).sort((a, b) => a - b);
}

function parseOpenMeteoDayHours(
  air: OpenMeteoAirHourly | undefined,
  wx: OpenMeteoWeatherHourly | undefined
): {
  hourlyPm25: Record<number, number>;
  hourlyWind: Record<number, number | null>;
  hourlyTemp: Record<number, number | null>;
} | null {
  const times = air?.hourly?.time ?? [];
  const pm25Arr = air?.hourly?.pm2_5 ?? [];
  if (times.length === 0) return null;

  const wxTimes = wx?.hourly?.time ?? [];
  const windArr = wx?.hourly?.wind_speed_10m ?? [];
  const tempArr = wx?.hourly?.temperature_2m ?? [];
  const wxIndex = new Map<string, number>();
  wxTimes.forEach((t, idx) => wxIndex.set(t, idx));

  const byDate = new Map<
    string,
    {
      pm: Record<number, number>;
      wind: Record<number, number | null>;
      temp: Record<number, number | null>;
    }
  >();

  times.forEach((iso, idx) => {
    const val = pm25Arr[idx];
    if (val === null || val === undefined || !Number.isFinite(val)) return;
    const [date, timePart] = iso.split("T");
    const hour = Number((timePart || "0").slice(0, 2));
    if (!date || Number.isNaN(hour)) return;

    const bucket = byDate.get(date) ?? { pm: {}, wind: {}, temp: {} };
    bucket.pm[hour] = Math.round(val * 10) / 10;

    const wIdx = wxIndex.get(iso);
    if (wIdx !== undefined) {
      const wv = windArr[wIdx];
      const tv = tempArr[wIdx];
      bucket.wind[hour] =
        wv !== null && wv !== undefined ? Math.round(wv * 10) / 10 : null;
      bucket.temp[hour] =
        tv !== null && tv !== undefined ? Math.round(tv * 10) / 10 : null;
    }
    byDate.set(date, bucket);
  });

  const sortedDates = Array.from(byDate.keys()).sort();
  // Prefer latest date that includes both 14h and 22h
  let chosen = sortedDates
    .slice()
    .reverse()
    .find((d) => {
      const b = byDate.get(d);
      return b && b.pm[14] !== undefined && b.pm[22] !== undefined;
    });
  if (!chosen) {
    chosen = sortedDates[sortedDates.length - 1];
  }
  if (!chosen) return null;

  const picked = byDate.get(chosen)!;
  return {
    hourlyPm25: picked.pm,
    hourlyWind: picked.wind,
    hourlyTemp: picked.temp,
  };
}

function findNearestStationSummary(
  lat: number,
  lon: number,
  stationSummaries: StationSummary[]
): { stationName: string; summary: StationSummary | null } {
  let bestRegion = REGIONS[0];
  let bestDist = Infinity;
  for (const r of REGIONS) {
    const d = haversineKm([lat, lon], r.center);
    if (d < bestDist) {
      bestDist = d;
      bestRegion = r;
    }
  }
  const summary =
    stationSummaries.find((s) => s.station === bestRegion.stationName) ??
    stationSummaries[0] ??
    null;
  return { stationName: bestRegion.label, summary };
}

export async function analyzeCustomRoute(params: {
  start: RoutePoint;
  end: RoutePoint;
  stationSummaries: StationSummary[];
  modelMetrics: RegressionModelMetrics;
}): Promise<CustomRouteAnalysis> {
  const { start, end, stationSummaries, modelMetrics } = params;

  // 1. Fetch walking/running route
  const routeRes = await fetchWalkingRoute(start, end);
  const coords = routeRes.coordinates;
  let apiCallsUsed = routeRes.callsUsed;

  // 2. Sample up to 5 representative points along the path for elevation + segment analysis
  const sampleIdxs = sampleRouteIndices(coords, 5);
  const sampledCoords = sampleIdxs.map((idx) => coords[idx]);

  // 3. Single batched Open-Meteo Elevation call (all 5 points in 1 request)
  let elevationsM: number[] = sampledCoords.map(() => 35);
  try {
    const lats = sampledCoords.map((p) => p[0].toFixed(5)).join(",");
    const lons = sampledCoords.map((p) => p[1].toFixed(5)).join(",");
    apiCallsUsed += 1;
    const elevJson = await fetchJsonWithTimeout<{ elevation?: number[] }>(
      `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`,
      5500
    );
    if (
      Array.isArray(elevJson.elevation) &&
      elevJson.elevation.length === sampledCoords.length
    ) {
      elevationsM = elevJson.elevation.map((e) => Math.round(e * 10) / 10);
    }
  } catch {
    // Keep clean default flat elevation
  }

  // 4. Batched Open-Meteo Air Quality & Weather calls for [start, mid, end] anchors (2 requests total)
  const midSample =
    sampledCoords[Math.floor(sampledCoords.length / 2)] ?? sampledCoords[0];
  const anchorPts: [number, number][] = [
    sampledCoords[0],
    midSample,
    sampledCoords[sampledCoords.length - 1],
  ];
  const anchorLats = anchorPts.map((p) => p[0].toFixed(4)).join(",");
  const anchorLons = anchorPts.map((p) => p[1].toFixed(4)).join(",");

  let dataSource: "open-meteo-live" | "nearest-station-fallback" =
    "nearest-station-fallback";
  let anchorHourly: Array<{
    hourlyPm25: Record<number, number>;
    hourlyWind: Record<number, number | null>;
    hourlyTemp: Record<number, number | null>;
  }> = [];

  try {
    apiCallsUsed += 2;
    const [aqRaw, wxRaw] = await Promise.all([
      fetchJsonWithTimeout<OpenMeteoAirHourly | OpenMeteoAirHourly[]>(
        `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${anchorLats}&longitude=${anchorLons}&hourly=pm2_5&timezone=Asia%2FSeoul&past_days=1&forecast_days=1`,
        6500
      ),
      fetchJsonWithTimeout<OpenMeteoWeatherHourly | OpenMeteoWeatherHourly[]>(
        `https://api.open-meteo.com/v1/forecast?latitude=${anchorLats}&longitude=${anchorLons}&hourly=temperature_2m,wind_speed_10m&wind_speed_unit=ms&timezone=Asia%2FSeoul&past_days=1&forecast_days=1`,
        6500
      ),
    ]);

    const aqList = Array.isArray(aqRaw) ? aqRaw : [aqRaw];
    const wxList = Array.isArray(wxRaw) ? wxRaw : [wxRaw];

    const parsedList = aqList
      .map((aqItem, i) => parseOpenMeteoDayHours(aqItem, wxList[i] ?? wxList[0]))
      .filter(
        (
          v
        ): v is {
          hourlyPm25: Record<number, number>;
          hourlyWind: Record<number, number | null>;
          hourlyTemp: Record<number, number | null>;
        } => v !== null
      );

    if (parsedList.length > 0) {
      anchorHourly = parsedList;
      dataSource = "open-meteo-live";
    }
  } catch {
    // Fallback to nearest Korean station summary below
  }

  const nearest = findNearestStationSummary(
    midSample[0],
    midSample[1],
    stationSummaries
  );

  let referenceLabel =
    dataSource === "open-meteo-live"
      ? "Open-Meteo 실시간 격자 + 구간 해발고도"
      : `${nearest.stationName} 기준 관측소 보정`;

  if (anchorHourly.length === 0) {
    const st = nearest.summary;
    const fallbackPm: Record<number, number> = {};
    const fallbackWind: Record<number, number | null> = {};
    const fallbackTemp: Record<number, number | null> = {};
    for (let h = 14; h <= 23; h++) {
      fallbackPm[h] = st?.hourlyPm25[h] ?? 22.0;
      fallbackWind[h] = st?.hourlyWind[h] ?? 1.2;
      fallbackTemp[h] = h <= 16 ? 14.0 : Math.max(4.0, 14.0 - (h - 15) * 1.1);
    }
    anchorHourly = [
      {
        hourlyPm25: fallbackPm,
        hourlyWind: fallbackWind,
        hourlyTemp: fallbackTemp,
      },
    ];
    referenceLabel = `${nearest.stationName} 관측소 데이터 보정 (API 오프라인 대체)`;
  }

  // Compute elevation statistics
  const minElevationM = Math.min(...elevationsM);
  const maxElevationM = Math.max(...elevationsM);
  const avgElevationM =
    Math.round(
      (elevationsM.reduce((a, b) => a + b, 0) / elevationsM.length) * 10
    ) / 10;
  let elevationGainM = 0;
  for (let i = 1; i < elevationsM.length; i++) {
    const d = elevationsM[i] - elevationsM[i - 1];
    if (d > 0) elevationGainM += d;
  }
  elevationGainM = Math.round(elevationGainM * 10) / 10;

  // Build continuous route segments between sample indices
  const segCount = Math.max(1, sampleIdxs.length - 1);
  const segments: CustomRouteSegment[] = [];

  for (let i = 0; i < segCount; i++) {
    const fromIdx = sampleIdxs[i];
    const toIdx = sampleIdxs[i + 1] ?? coords.length - 1;
    const segCoords = coords.slice(fromIdx, toIdx + 1);
    if (segCoords.length < 2) continue;

    const eA = elevationsM[i] ?? avgElevationM;
    const eB = elevationsM[i + 1] ?? eA;
    const midElev = Math.round(((eA + eB) / 2) * 10) / 10;
    const elevDelta = Math.round((eB - eA) * 10) / 10;
    const relElev = midElev - avgElevationM;

    // Micro-topography adjustment: relative lowlands pool night PM2.5; higher ground catches wind
    const exposureFactor =
      Math.round(clamp(1.0 - relElev * 0.012, 0.78, 1.14) * 100) / 100;
    const windFactor =
      Math.round(clamp(1.0 + relElev * 0.014, 0.8, 1.25) * 100) / 100;

    let terrainNote = "평탄 구간 · 주변 풍속 기준";
    if (relElev <= -5 || exposureFactor >= 1.06) {
      terrainNote = "상대 저지대 · 야간 찬 공기 침강·정체 주의";
    } else if (relElev >= 5 || exposureFactor <= 0.92) {
      terrainNote = "상대 고지대·개방 구간 · 바람 순환 유리";
    }

    // Interpolate baseline PM2.5 across start/mid/end anchors
    const tSeg = (i + 0.5) / segCount;
    const anchorFloatIdx = tSeg * (anchorHourly.length - 1);
    const a0 = Math.floor(anchorFloatIdx);
    const a1 = Math.min(anchorHourly.length - 1, a0 + 1);
    const frac = anchorFloatIdx - a0;

    const segHourlyPm: Record<number, number> = {};
    for (let h = 14; h <= 23; h++) {
      const base0 = anchorHourly[a0].hourlyPm25[h] ?? anchorHourly[0].hourlyPm25[22] ?? 22;
      const base1 = anchorHourly[a1].hourlyPm25[h] ?? base0;
      const baseVal = base0 + (base1 - base0) * frac;
      segHourlyPm[h] = Math.round(baseVal * exposureFactor * 10) / 10;
    }

    segments.push({
      index: i,
      label: `구간 ${i + 1}`,
      coordinates: segCoords,
      elevationM: midElev,
      elevationDeltaM: elevDelta,
      exposureFactor,
      windFactor,
      terrainNote,
      hourlyPm25: segHourlyPm,
    });
  }

  // Fallback segment if coordinates only had 2 points that collapsed
  if (segments.length === 0) {
    const baseHourly: Record<number, number> = {};
    for (let h = 14; h <= 23; h++) {
      baseHourly[h] = anchorHourly[0].hourlyPm25[h] ?? 22.0;
    }
    segments.push({
      index: 0,
      label: "전체 구간",
      coordinates: coords,
      elevationM: avgElevationM,
      elevationDeltaM: 0,
      exposureFactor: 1.0,
      windFactor: 1.0,
      terrainNote: "평탄 구간 · 주변 풍속 기준",
      hourlyPm25: baseHourly,
    });
  }

  // Compute route-averaged hourly series (14시~23시)
  const hourlySeries: CustomRouteHourPoint[] = [];
  for (let h = 14; h <= 23; h++) {
    const pmAvg =
      segments.reduce((acc, s) => acc + (s.hourlyPm25[h] ?? 22), 0) /
      segments.length;
    const windVals = anchorHourly
      .map((a) => a.hourlyWind[h])
      .filter((v): v is number => v !== null && v !== undefined);
    const windAvg =
      windVals.length > 0
        ? Math.round(
            (windVals.reduce((a, b) => a + b, 0) / windVals.length) * 10
          ) / 10
        : null;
    const tempVals = anchorHourly
      .map((a) => a.hourlyTemp[h])
      .filter((v): v is number => v !== null && v !== undefined);
    const tempAvg =
      tempVals.length > 0
        ? Math.round(
            (tempVals.reduce((a, b) => a + b, 0) / tempVals.length) * 10
          ) / 10
        : null;

    hourlySeries.push({
      hour: h,
      pm25: Math.round(pmAvg * 10) / 10,
      wind: windAvg,
      temp: tempAvg,
    });
  }

  const pt14 = hourlySeries.find((p) => p.hour === 14) ?? hourlySeries[0];
  const pt18 = hourlySeries.find((p) => p.hour === 18) ?? pt14;
  const pt21 = hourlySeries.find((p) => p.hour === 21) ?? pt18;
  const pt22 =
    hourlySeries.find((p) => p.hour === 22) ??
    hourlySeries[hourlySeries.length - 1];

  const pm14 = pt14.pm25;
  const pm22 = pt22.pm25;
  const diff = Math.round((pm22 - pm14) * 10) / 10;
  const wind22 = pt22.wind ?? pt21.wind ?? 1.2;
  const tempDrop =
    pt14.temp !== null && pt22.temp !== null
      ? Math.max(0, Math.round((pt14.temp - pt22.temp) * 10) / 10)
      : 5.5;

  const avgExposure =
    Math.round(
      (segments.reduce((a, s) => a + s.exposureFactor, 0) / segments.length) *
        100
    ) / 100;

  // Apply trained Ridge regression weights to predict 22h PM2.5 & inversion risk
  const w = modelMetrics.weights;
  const slope = pt18.pm25 - pm14;
  const windForModel = pt21.wind ?? wind22 ?? 1.3;
  const rawPred =
    (w.intercept +
      w.pm14 * pm14 +
      w.afternoonSlope * slope +
      w.windEvening * windForModel +
      w.tempDrop * tempDrop) *
    avgExposure;
  const predictedPm22 = Math.max(5.0, Math.round(rawPred * 10) / 10);

  const predDelta = predictedPm22 - pm14;
  const windPenalty = windForModel < 1.2 ? (1.2 - windForModel) * 1.4 : -0.6;
  const elevPenalty = maxElevationM - minElevationM >= 15 && minElevationM < avgElevationM - 5 ? 0.35 : 0;
  const logit = predDelta * 0.22 + windPenalty + elevPenalty;
  const inversionProbPct = Math.max(
    4,
    Math.min(97, Math.round((1 / (1 + Math.exp(-logit))) * 100))
  );

  const isInversion = pm14 < pm22 && diff > 0.5;
  const topFactor =
    windForModel < 1.1
      ? `야간 약풍 정체 (${windForModel.toFixed(1)} m/s)`
      : tempDrop >= 6
      ? `일몰 기온 하강 (-${tempDrop.toFixed(1)}℃)`
      : maxElevationM - minElevationM >= 12
      ? `경로 고도차 (${Math.round(maxElevationM - minElevationM)}m 지형)`
      : `오후→밤 농도 변화 (${diff >= 0 ? "+" : ""}${diff.toFixed(1)} ㎍/㎥)`;

  const bestPt = [...hourlySeries].sort((a, b) => a.pm25 - b.pm25)[0];
  const bestHour = bestPt?.hour ?? 14;

  const startLabel = start.label?.trim() || "출발지";
  const endLabel = end.label?.trim() || "도착지";
  const elevSpan = Math.round((maxElevationM - minElevationM) * 10) / 10;
  const terrainSummary =
    elevSpan >= 12
      ? `고저차 ${elevSpan}m (${Math.round(minElevationM)}~${Math.round(maxElevationM)}m) · 저지대 정체 구간 포함`
      : `완만 경로 (평균 해발 ${Math.round(avgElevationM)}m, 고저차 ${elevSpan}m)`;

  return {
    id: `custom-${Date.now()}`,
    name: `${startLabel} → ${endLabel}`,
    startPoint: { ...start, label: startLabel },
    endPoint: { ...end, label: endLabel },
    distanceKm: routeRes.distanceKm,
    runningMinutes: Math.max(3, Math.round(routeRes.distanceKm * 6)), // 6:00/km pace
    walkingMinutes: Math.max(5, Math.round(routeRes.distanceKm * 14)),
    routingSource: routeRes.routingSource,
    dataSource,
    referenceLabel,
    apiCallsUsed,
    fetchedAt: new Date().toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    coordinates: coords,
    elevationsM,
    minElevationM,
    maxElevationM,
    elevationGainM,
    avgElevationM,
    segments,
    hourlySeries,
    pm14,
    pm22,
    diff,
    wind22,
    tempDrop,
    isInversion,
    predictedPm22,
    inversionProbPct,
    topFactor,
    bestHour,
    exposureFactor: avgExposure,
    terrainSummary,
  };
}

export function evaluateCustomRouteAtHour(
  analysis: CustomRouteAnalysis,
  hour: number
): CustomRouteAtHourView {
  const pt =
    analysis.hourlySeries.find((p) => p.hour === hour) ??
    analysis.hourlySeries[analysis.hourlySeries.length - 1];
  const pmAtHour = pt?.pm25 ?? analysis.pm22;
  const windAtHour = pt?.wind ?? analysis.wind22;
  const tempAtHour = pt?.temp ?? null;

  const status = classifyCourseStatus(
    pmAtHour,
    analysis.isInversion,
    analysis.diff,
    hour
  );
  const cigaretteEq = Math.max(0.2, Math.round((pmAtHour / 16.5) * 10) / 10);

  const segmentViews = analysis.segments.map((seg) => {
    const segPm = seg.hourlyPm25[hour] ?? pmAtHour;
    const segInversion = seg.exposureFactor >= 1.0 && analysis.isInversion;
    const segStatus = classifyCourseStatus(
      segPm,
      segInversion,
      analysis.diff * seg.exposureFactor,
      hour
    );
    return {
      ...seg,
      pmAtHour: segPm,
      status: segStatus,
    };
  });

  return {
    pmAtHour,
    windAtHour,
    tempAtHour,
    status,
    cigaretteEq,
    segmentViews,
  };
}
