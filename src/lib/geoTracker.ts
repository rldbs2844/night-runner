import { haversineKm } from "@/lib/customRouteAnalyzer";

export interface UserLocationState {
  lat: number;
  lon: number;
  accuracyM: number;
  headingDeg: number | null;
  speedMps: number | null;
  timestamp: number;
}

export interface RouteProgressInfo {
  distanceToRouteM: number;
  isOnRoute: boolean;
  remainingKm: number;
  totalKm: number;
  progressPct: number;
}

export function computeBearingDeg(
  from: [number, number],
  to: [number, number]
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  const lat1 = toRad(from[0]);
  const lat2 = toRad(to[0]);
  const dLon = toRad(to[1] - from[1]);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Computes approximate perpendicular distance from point P to segment AB in meters,
 * plus projection fraction t in [0, 1].
 */
function pointToSegmentMeters(
  p: [number, number],
  a: [number, number],
  b: [number, number]
): { distM: number; t: number } {
  const midLatRad = ((a[0] + b[0]) * 0.5 * Math.PI) / 180;
  const mPerLat = 111_320;
  const mPerLon = 111_320 * Math.cos(midLatRad);

  const ax = 0;
  const ay = 0;
  const bx = (b[1] - a[1]) * mPerLon;
  const by = (b[0] - a[0]) * mPerLat;
  const px = (p[1] - a[1]) * mPerLon;
  const py = (p[0] - a[0]) * mPerLat;

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = 0;
  if (lenSq > 1e-6) {
    t = Math.max(0, Math.min(1, (px * dx + py * dy) / lenSq));
  }
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  const distM = Math.hypot(px - projX, py - projY);
  return { distM, t };
}

export function computeRouteProgress(
  userPos: [number, number],
  coords: [number, number][]
): RouteProgressInfo | null {
  if (coords.length < 2) return null;

  const cumKm: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    cumKm.push(cumKm[i - 1] + haversineKm(coords[i - 1], coords[i]));
  }
  const totalKm = cumKm[cumKm.length - 1];
  if (totalKm <= 0.01) return null;

  let bestDistM = Infinity;
  let bestAlongKm = 0;

  for (let i = 1; i < coords.length; i++) {
    const seg = pointToSegmentMeters(userPos, coords[i - 1], coords[i]);
    if (seg.distM < bestDistM) {
      bestDistM = seg.distM;
      const segLenKm = cumKm[i] - cumKm[i - 1];
      bestAlongKm = cumKm[i - 1] + seg.t * segLenKm;
    }
  }

  const remainingKm = Math.max(0, totalKm - bestAlongKm);
  const progressPct = Math.max(
    0,
    Math.min(100, Math.round((bestAlongKm / totalKm) * 100))
  );

  return {
    distanceToRouteM: Math.round(bestDistM),
    isOnRoute: bestDistM <= 55,
    remainingKm: Math.round(remainingKm * 10) / 10,
    totalKm: Math.round(totalKm * 10) / 10,
    progressPct,
  };
}

export function buildGpsMarkerHtml(headingDeg: number | null): string {
  const coneHtml =
    headingDeg !== null
      ? `<div class="gps-heading-cone" style="transform: rotate(${Math.round(
          headingDeg
        )}deg);"></div>`
      : "";
  return `<div class="gps-marker-wrap">${coneHtml}<div class="gps-pulse-ring"></div><div class="gps-dot"></div></div>`;
}
