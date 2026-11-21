"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import {
  ArrowRight,
  Wind,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Info,
  KeyRound,
  Download,
  Mountain,
  TrendingUp,
} from "lucide-react";
import { REGIONS, type CourseVariant } from "@/lib/courses";
import {
  classifyCourseStatus,
  type StationSummary,
  type TrafficStatus,
} from "@/lib/csvParser";
import type {
  RegressionModelMetrics,
  StationPrediction,
} from "@/lib/inversionModel";
import type { MapCourseItem, MapProvider } from "@/components/LeafletMap";

type ExtendedMapProvider = MapProvider | "kakao";

const LeafletMap = dynamic(() => import("@/components/LeafletMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[460px] sm:h-[530px] rounded-lg border border-[#e2e8f0] bg-[#f8fafc] flex items-center justify-center text-sm text-[#64748b]">
      지도를 불러오는 중입니다...
    </div>
  ),
});

const KakaoMap = dynamic(() => import("@/components/KakaoMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[460px] sm:h-[530px] rounded-lg border border-[#e2e8f0] bg-[#f8fafc] flex items-center justify-center text-sm text-[#64748b]">
      카카오맵을 불러오는 중입니다...
    </div>
  ),
});

interface CourseMapTabProps {
  stationSummaries: StationSummary[];
  modelMetrics: RegressionModelMetrics;
  predictions: Map<string, StationPrediction>;
}

const STATUS_BADGE: Record<
  TrafficStatus,
  { label: string; dot: string; bg: string; text: string; border: string }
> = {
  safe: {
    label: "안전",
    dot: "bg-[#16a34a]",
    bg: "bg-[#f0fdf4]",
    text: "text-[#15803d]",
    border: "border-[#bbf7d0]",
  },
  caution: {
    label: "주의",
    dot: "bg-[#d97706]",
    bg: "bg-[#fffbeb]",
    text: "text-[#b45309]",
    border: "border-[#fde68a]",
  },
  danger: {
    label: "역전 정체 위험",
    dot: "bg-[#dc2626]",
    bg: "bg-[#fef2f2]",
    text: "text-[#b91c1c]",
    border: "border-[#fecaca]",
  },
};

const ENV_KAKAO_KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY ?? "";
const ENV_VWORLD_KEY = process.env.NEXT_PUBLIC_VWORLD_API_KEY ?? "";
const ENV_MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_API_KEY ?? "";

const storageListeners = new Set<() => void>();
function subscribeStorage(cb: () => void) {
  storageListeners.add(cb);
  const onStorage = () => cb();
  window.addEventListener("storage", onStorage);
  return () => {
    storageListeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}
function notifyStorage() {
  storageListeners.forEach((cb) => cb());
}
function useStoredValue(
  key: string,
  fallback: string
): [string, (val: string) => void] {
  const value = useSyncExternalStore(
    subscribeStorage,
    () => {
      try {
        return window.localStorage.getItem(key) ?? fallback;
      } catch {
        return fallback;
      }
    },
    () => fallback
  );
  const setValue = (next: string) => {
    try {
      window.localStorage.setItem(key, next);
    } catch {}
    notifyStorage();
  };
  return [value, setValue];
}

export default function CourseMapTab({
  stationSummaries,
  modelMetrics,
  predictions,
}: CourseMapTabProps) {
  const [selectedHour, setSelectedHour] = useState<number>(22);
  const [selectedRegionId, setSelectedRegionId] =
    useState<string>("dongducheon");
  const [selectedCourseId, setSelectedCourseId] = useState<string>(
    "dongducheon-sincheon"
  );

  const [storedProvider, setStoredProvider] = useStoredValue(
    "nr_map_provider",
    ENV_KAKAO_KEY ? "kakao" : "osm"
  );
  const mapProvider = storedProvider as ExtendedMapProvider;
  const [kakaoKey, setKakaoKey] = useStoredValue("nr_kakao_key", ENV_KAKAO_KEY);
  const [vworldKey, setVworldKey] = useStoredValue(
    "nr_vworld_key",
    ENV_VWORLD_KEY
  );
  const [maptilerKey, setMaptilerKey] = useStoredValue(
    "nr_maptiler_key",
    ENV_MAPTILER_KEY
  );
  const [showKeyPanel, setShowKeyPanel] = useState<boolean>(false);

  const handleChangeProvider = (next: ExtendedMapProvider) => {
    setStoredProvider(next);
    if (
      (next === "kakao" && !kakaoKey.trim()) ||
      ((next === "vworld-base" || next === "vworld-hybrid") &&
        !vworldKey.trim()) ||
      (next === "maptiler-positron" && !maptilerKey.trim())
    ) {
      setShowKeyPanel(true);
    }
  };

  const handleSaveKeys = (
    nextKakao: string,
    nextVworld: string,
    nextMaptiler: string
  ) => {
    setKakaoKey(nextKakao.trim());
    setVworldKey(nextVworld.trim());
    setMaptilerKey(nextMaptiler.trim());
  };

  const summaryMap = useMemo(() => {
    const map = new Map<string, StationSummary>();
    stationSummaries.forEach((s) => map.set(s.station, s));
    return map;
  }, [stationSummaries]);

  const regionMetrics = useMemo(() => {
    return REGIONS.map((region) => {
      const st = summaryMap.get(region.stationName);
      const pred = predictions.get(region.stationName);
      const basePm14 = st?.pm14 ?? 21.0;
      const basePm22 = st?.pm22 ?? 21.0;
      const basePmAtHour = st?.hourlyPm25[selectedHour] ?? basePm22;
      const baseWindAtHour =
        st?.hourlyWind[selectedHour] ?? st?.wind22 ?? 1.2;
      const basePred22 = pred?.predictedPm22 ?? basePm22;

      const computedCourses = region.courses.map((variant: CourseVariant) => {
        const pm14 = Math.round(basePm14 * variant.exposureFactor * 10) / 10;
        const pm22 = Math.round(basePm22 * variant.exposureFactor * 10) / 10;
        const pmAtHour =
          Math.round(basePmAtHour * variant.exposureFactor * 10) / 10;
        const predictedPm22 =
          Math.round(basePred22 * variant.exposureFactor * 10) / 10;
        const diff = Math.round((pm22 - pm14) * 10) / 10;
        const isInversion = variant.isWindCorridor ? false : pm14 < pm22;
        const windAtHour =
          baseWindAtHour !== null
            ? Math.round(baseWindAtHour * variant.windFactor * 10) / 10
            : null;
        const status = classifyCourseStatus(
          pmAtHour,
          isInversion,
          diff,
          selectedHour
        );
        const cigaretteEq = Math.max(
          0.2,
          Math.round((pmAtHour / 16.5) * 10) / 10
        );

        const eveningSeries = Array.from({ length: 10 }, (_, idx) => {
          const hr = 14 + idx;
          const raw = st?.hourlyPm25[hr] ?? basePmAtHour;
          return {
            hour: hr,
            pm25: Math.round(raw * variant.exposureFactor * 10) / 10,
          };
        });

        const baseProb = pred?.inversionProbPct ?? (isInversion ? 85 : 15);
        const courseInversionProb = variant.isWindCorridor
          ? Math.max(4, Math.round(baseProb * variant.exposureFactor * 0.45))
          : baseProb;

        return {
          variant,
          pm14,
          pm22,
          pmAtHour,
          predictedPm22,
          inversionProbPct: courseInversionProb,
          diff,
          isInversion,
          windAtHour,
          status,
          cigaretteEq,
          eveningSeries,
        };
      });

      // Rank courses at the selected hour: safe first, then lowest PM2.5
      const rankedCourses = [...computedCourses].sort((a, b) => {
        const order = { safe: 0, caution: 1, danger: 2 };
        if (order[a.status] !== order[b.status]) {
          return order[a.status] - order[b.status];
        }
        return a.pmAtHour - b.pmAtHour;
      });

      // Region pill dot reflects worst status of default/first route in region
      const primaryCourseStatus = computedCourses[0]?.status ?? "safe";

      return {
        region,
        stationSummary: st,
        stationPrediction: pred,
        courses: computedCourses,
        rankedCourses,
        bestCourse: rankedCourses[0],
        primaryCourseStatus,
      };
    });
  }, [summaryMap, predictions, selectedHour]);

  const mapCourses: MapCourseItem[] = useMemo(() => {
    const items: MapCourseItem[] = [];
    regionMetrics.forEach(({ region, courses }) => {
      courses.forEach((c) => {
        items.push({
          regionId: region.id,
          regionLabel: region.label,
          courseId: c.variant.id,
          courseName: c.variant.name,
          distanceKm: c.variant.distanceKm,
          pmAtHour: c.pmAtHour,
          status: c.status,
          isWindCorridor: c.variant.isWindCorridor,
          coordinates: c.variant.coordinates,
        });
      });
    });
    return items;
  }, [regionMetrics]);

  const activeRegionMetric =
    regionMetrics.find((m) => m.region.id === selectedRegionId) ??
    regionMetrics[0];
  const activeCourse =
    activeRegionMetric.courses.find(
      (c) => c.variant.id === selectedCourseId
    ) ?? activeRegionMetric.courses[0];
  const activeBadge = STATUS_BADGE[activeCourse.status];
  const bestCourse = activeRegionMetric.bestCourse;

  const handleSelectRegion = (regionId: string) => {
    setSelectedRegionId(regionId);
    const targetRegion = regionMetrics.find((m) => m.region.id === regionId);
    if (targetRegion && targetRegion.courses[0]) {
      setSelectedCourseId(targetRegion.courses[0].variant.id);
    }
  };

  const handleDownloadGpx = () => {
    const v = activeCourse.variant;
    const trkpts = v.coordinates
      .map(([lat, lon]) => `      <trkpt lat="${lat}" lon="${lon}"></trkpt>`)
      .join("\n");
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="NightRunner" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${v.name}</name>
    <desc>${activeRegionMetric.region.label} (${v.distanceKm}km) · ${v.terrainNote}</desc>
  </metadata>
  <trk>
    <name>${v.name}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;

    const blob = new Blob([gpx], { type: "application/gpx+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${v.id}.gpx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const needsMissingKeyWarning =
    (mapProvider === "kakao" && !kakaoKey.trim()) ||
    ((mapProvider === "vworld-base" || mapProvider === "vworld-hybrid") &&
      !vworldKey.trim()) ||
    (mapProvider === "maptiler-positron" && !maptilerKey.trim());

  const useKakao = mapProvider === "kakao" && Boolean(kakaoKey.trim());

  return (
    <div className="space-y-4">
      {/* Top Control Bar: Hour Slider + 6 Region Buttons */}
      <div className="bg-[#ffffff] border border-[#e2e8f0] rounded-lg p-4 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* Hour Slider */}
          <div className="flex-1 max-w-xl space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1.5 font-semibold text-[#0f172a]">
                <Clock className="w-3.5 h-3.5 text-[#475569]" />
                관측 및 러닝 시각 선택
              </span>
              <span className="font-semibold text-[#0f172a] tabular-nums">
                {selectedHour}시{" "}
                <span className="font-normal text-[#64748b]">
                  {selectedHour <= 16
                    ? "(주간 대기 혼합 시간대)"
                    : selectedHour <= 19
                    ? "(일몰 전후 전환 시간대)"
                    : "(야간 역전층 주의 시간대)"}
                </span>
              </span>
            </div>
            <input
              type="range"
              min={14}
              max={23}
              step={1}
              value={selectedHour}
              onChange={(e) => setSelectedHour(Number(e.target.value))}
              className="w-full cursor-pointer"
              aria-label="시간대 선택 (14시~23시)"
            />
            <div className="flex justify-between text-[11px] text-[#64748b] tabular-nums">
              <span>14시</span>
              <span>16시</span>
              <span>18시</span>
              <span>20시</span>
              <span className="font-semibold text-[#0f172a]">
                21~22시 (역전 피크)
              </span>
              <span>23시</span>
            </div>
          </div>

          {/* 6 Region Buttons */}
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-[#475569]">
              권역별 코스 선택 ({activeRegionMetric.courses.length}개 노선)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {regionMetrics.map(({ region, primaryCourseStatus }) => {
                const isSelected = region.id === selectedRegionId;
                const badge = STATUS_BADGE[primaryCourseStatus];
                return (
                  <button
                    key={region.id}
                    type="button"
                    onClick={() => handleSelectRegion(region.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition ${
                      isSelected
                        ? "bg-[#0f172a] text-[#ffffff] border-[#0f172a]"
                        : "bg-[#ffffff] text-[#334155] border-[#e2e8f0] hover:bg-[#f8fafc]"
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${badge.dot}`} />
                    <span>{region.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Main Split: Left Map + Right Inspection Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left: Map & Map Engine Switcher */}
        <div className="lg:col-span-7 bg-[#ffffff] border border-[#e2e8f0] rounded-lg p-3 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <div className="text-xs font-semibold text-[#0f172a]">
              {activeRegionMetric.region.label} 권역 코스 지도
              <span className="ml-2 font-normal text-[#64748b]">
                ({activeRegionMetric.region.terrainSummary})
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex flex-wrap rounded-md border border-[#e2e8f0] bg-[#f8fafc] p-0.5 text-[11px]">
                {(
                  [
                    ["kakao", "카카오맵"],
                    ["osm", "기본(OSM)"],
                    ["vworld-base", "브이월드 일반"],
                    ["vworld-hybrid", "브이월드 위성"],
                    ["maptiler-positron", "MapTiler"],
                  ] as [ExtendedMapProvider, string][]
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleChangeProvider(key)}
                    className={`px-2 py-1 rounded font-medium transition ${
                      mapProvider === key
                        ? "bg-[#ffffff] text-[#0f172a] border border-[#e2e8f0]"
                        : "text-[#64748b] hover:text-[#0f172a] border border-transparent"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setShowKeyPanel((v) => !v)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-[#e2e8f0] bg-[#ffffff] hover:bg-[#f8fafc] text-[11px] font-medium text-[#334155]"
              >
                <KeyRound className="w-3 h-3 text-[#475569]" />
                API 키
              </button>
            </div>
          </div>

          {showKeyPanel && (
            <div className="rounded-md border border-[#e2e8f0] bg-[#f8fafc] p-3 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#0f172a]">
                  정밀 지도 API 키 설정 (브라우저 로컬 저장)
                </span>
                <button
                  type="button"
                  onClick={() => setShowKeyPanel(false)}
                  className="text-[11px] text-[#64748b] hover:text-[#0f172a]"
                >
                  닫기
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <label className="space-y-1">
                  <span className="block text-[11px] font-medium text-[#0f172a]">
                    카카오맵 JavaScript 키 (권장)
                  </span>
                  <input
                    type="text"
                    value={kakaoKey}
                    onChange={(e) =>
                      handleSaveKeys(e.target.value, vworldKey, maptilerKey)
                    }
                    placeholder="카카오 JavaScript 앱 키 입력"
                    className="w-full px-2.5 py-1.5 rounded border border-[#e2e8f0] bg-[#ffffff] text-xs text-[#0f172a]"
                  />
                </label>
                <label className="space-y-1">
                  <span className="block text-[11px] text-[#475569]">
                    국토교통부 브이월드(VWORLD) 키
                  </span>
                  <input
                    type="text"
                    value={vworldKey}
                    onChange={(e) =>
                      handleSaveKeys(kakaoKey, e.target.value, maptilerKey)
                    }
                    placeholder="브이월드 인증키 입력 (선택)"
                    className="w-full px-2.5 py-1.5 rounded border border-[#e2e8f0] bg-[#ffffff] text-xs text-[#0f172a]"
                  />
                </label>
                <label className="space-y-1">
                  <span className="block text-[11px] text-[#475569]">
                    MapTiler Positron 키
                  </span>
                  <input
                    type="text"
                    value={maptilerKey}
                    onChange={(e) =>
                      handleSaveKeys(kakaoKey, vworldKey, e.target.value)
                    }
                    placeholder="MapTiler API 키 입력 (선택)"
                    className="w-full px-2.5 py-1.5 rounded border border-[#e2e8f0] bg-[#ffffff] text-xs text-[#0f172a]"
                  />
                </label>
              </div>
              <p className="text-[11px] text-[#64748b] leading-relaxed">
                카카오 디벨로퍼스 앱의 <strong>JavaScript 키</strong>를 입력하고 Web 도메인을 등록하면 즉시 한국 정밀 지도로 전환됩니다.
              </p>
            </div>
          )}

          {needsMissingKeyWarning && (
            <div className="rounded-md border border-[#fde68a] bg-[#fffbeb] px-3 py-2 text-[11px] text-[#b45309]">
              선택한 지도 엔진의 API 키가 아직 입력되지 않아 기본 OpenStreetMap 지도로 표시 중입니다.
            </div>
          )}

          {useKakao ? (
            <KakaoMap
              kakaoKey={kakaoKey}
              regions={REGIONS}
              courses={mapCourses}
              selectedRegionId={selectedRegionId}
              selectedCourseId={activeCourse.variant.id}
              onSelectCourse={(regionId, courseId) => {
                setSelectedRegionId(regionId);
                setSelectedCourseId(courseId);
              }}
            />
          ) : (
            <LeafletMap
              regions={REGIONS}
              courses={mapCourses}
              selectedRegionId={selectedRegionId}
              selectedCourseId={activeCourse.variant.id}
              mapProvider={mapProvider === "kakao" ? "osm" : mapProvider}
              vworldKey={vworldKey}
              maptilerKey={maptilerKey}
              onSelectCourse={(regionId, courseId) => {
                setSelectedRegionId(regionId);
                setSelectedCourseId(courseId);
              }}
            />
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <p className="text-[11px] text-[#64748b]">
              실선은 선택 코스(1km 거리 표식 포함), 점선은 권역 내 대안 코스입니다.
            </p>
            <div className="flex items-center gap-3 text-xs text-[#475569]">
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#16a34a]" />
                안전
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#d97706]" />
                주의
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-[#dc2626]" />
                역전 정체 위험
              </span>
            </div>
          </div>
        </div>

        {/* Right: Ranked Courses + Selected Course Detail + Regression Prediction */}
        <div className="lg:col-span-5 bg-[#ffffff] border border-[#e2e8f0] rounded-lg p-4 space-y-4">
          {/* Dynamic Time-Based Ranked Course Selector */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[#0f172a]">
                {selectedHour}시 기준 {activeRegionMetric.region.label} 코스 추천 순위
              </span>
              <span className="text-[11px] text-[#64748b]">
                안전 우선 정렬
              </span>
            </div>
            <div className="space-y-1.5">
              {activeRegionMetric.rankedCourses.map((c, idx) => {
                const badge = STATUS_BADGE[c.status];
                const isSel = c.variant.id === activeCourse.variant.id;
                return (
                  <button
                    key={c.variant.id}
                    type="button"
                    onClick={() => setSelectedCourseId(c.variant.id)}
                    className={`w-full px-3 py-2 rounded-md border text-left transition flex items-center justify-between gap-2 ${
                      isSel
                        ? "border-[#0f172a] bg-[#f8fafc]"
                        : "border-[#e2e8f0] bg-[#ffffff] hover:bg-[#f8fafc]"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[11px] font-bold text-[#64748b] w-8 shrink-0">
                        {idx + 1}순위
                      </span>
                      <span className={`w-2 h-2 rounded-full shrink-0 ${badge.dot}`} />
                      <span className="text-xs font-semibold text-[#0f172a] truncate">
                        {c.variant.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 text-xs tabular-nums">
                      <span className="text-[11px] text-[#64748b]">
                        {c.variant.distanceKm.toFixed(1)}km
                      </span>
                      <span className={`font-bold ${badge.text}`}>
                        {c.pmAtHour.toFixed(1)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Course Header */}
          <div className="flex items-start justify-between gap-3 pt-2 pb-3 border-t border-b border-[#e2e8f0]">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#64748b]">
                <span>
                  측정소: {activeRegionMetric.region.stationName} ·{" "}
                  {activeCourse.variant.distanceKm.toFixed(1)} km
                </span>
                <span className="inline-flex items-center gap-1">
                  <Mountain className="w-3 h-3" />
                  {activeCourse.variant.elevationNote}
                </span>
              </div>
              <h2 className="text-base font-bold text-[#0f172a]">
                {activeCourse.variant.name}
              </h2>
              <p className="text-xs text-[#475569]">
                {activeCourse.variant.terrainNote}
              </p>
            </div>
            <span
              className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${activeBadge.bg} ${activeBadge.text} ${activeBadge.border}`}
            >
              <span className={`w-2 h-2 rounded-full ${activeBadge.dot}`} />
              {activeBadge.label}
            </span>
          </div>

          {/* 14시 vs 22시 PM2.5 Comparison */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[#475569]">
                초미세먼지(PM2.5) 시간대 비교
              </span>
              <button
                type="button"
                onClick={handleDownloadGpx}
                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-[#e2e8f0] bg-[#f8fafc] hover:bg-[#f1f5f9] text-[11px] font-medium text-[#334155]"
              >
                <Download className="w-3 h-3" />
                GPX 다운로드
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-md border border-[#e2e8f0] bg-[#f8fafc] p-2.5">
                <div className="text-[11px] text-[#64748b]">낮 14시</div>
                <div className="text-base font-bold text-[#0f172a] tabular-nums mt-0.5">
                  {activeCourse.pm14.toFixed(1)}
                  <span className="text-[11px] font-normal text-[#64748b] ml-0.5">
                    ㎍/㎥
                  </span>
                </div>
              </div>
              <div className="rounded-md border border-[#e2e8f0] bg-[#f8fafc] p-2.5">
                <div className="text-[11px] text-[#64748b]">밤 22시</div>
                <div
                  className={`text-base font-bold tabular-nums mt-0.5 ${
                    activeCourse.isInversion
                      ? "text-[#dc2626]"
                      : "text-[#16a34a]"
                  }`}
                >
                  {activeCourse.pm22.toFixed(1)}
                  <span className="text-[11px] font-normal text-[#64748b] ml-0.5">
                    ㎍/㎥
                  </span>
                </div>
              </div>
              <div className="rounded-md border border-[#e2e8f0] bg-[#ffffff] p-2.5">
                <div className="text-[11px] text-[#64748b]">
                  선택({selectedHour}시)
                </div>
                <div className="text-base font-bold text-[#0f172a] tabular-nums mt-0.5">
                  {activeCourse.pmAtHour.toFixed(1)}
                  <span className="text-[11px] font-normal text-[#64748b] ml-0.5">
                    ㎍/㎥
                  </span>
                </div>
              </div>
            </div>

            {/* 14h~23h Mini Bar Strip */}
            <div className="rounded-md border border-[#e2e8f0] bg-[#f8fafc] px-2.5 py-2 space-y-1">
              <div className="flex justify-between text-[10px] text-[#64748b]">
                <span>14시~23시 코스 농도 변화 (막대 클릭 시 시각 이동)</span>
                <span className="tabular-nums">기준선 35 ㎍/㎥</span>
              </div>
              <div className="grid grid-cols-10 gap-1 items-end h-10 pt-1">
                {activeCourse.eveningSeries.map((pt) => {
                  const pct = Math.min(100, Math.max(12, (pt.pm25 / 60) * 100));
                  const barColor =
                    pt.pm25 >= 35
                      ? "bg-[#dc2626]"
                      : pt.pm25 >= 24
                      ? "bg-[#d97706]"
                      : "bg-[#16a34a]";
                  const isCur = pt.hour === selectedHour;
                  return (
                    <button
                      key={pt.hour}
                      type="button"
                      onClick={() => setSelectedHour(pt.hour)}
                      title={`${pt.hour}시: ${pt.pm25.toFixed(1)} ㎍/㎥`}
                      className="flex flex-col items-center justify-end h-full group"
                    >
                      <div
                        className={`w-full rounded-t-xs transition-all ${barColor} ${
                          isCur
                            ? "opacity-100 ring-1 ring-[#0f172a]"
                            : "opacity-55 group-hover:opacity-85"
                        }`}
                        style={{ height: `${pct}%` }}
                      />
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-10 gap-1 text-center text-[10px] text-[#64748b] tabular-nums">
                {activeCourse.eveningSeries.map((pt) => (
                  <span
                    key={pt.hour}
                    className={
                      pt.hour === selectedHour
                        ? "font-bold text-[#0f172a]"
                        : ""
                    }
                  >
                    {pt.hour}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Multiple Regression Inversion Prediction Card */}
          <div className="rounded-md border border-[#e2e8f0] bg-[#f8fafc] p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1.5 font-semibold text-[#0f172a]">
                <TrendingUp className="w-3.5 h-3.5 text-[#475569]" />
                22시 야간 역전 예측 (다중회귀 모델)
              </span>
              <span className="text-[11px] text-[#64748b] tabular-nums">
                오차 MAE {modelMetrics.mae.toFixed(1)} ㎍/㎥ · R²{" "}
                {modelMetrics.rSquared.toFixed(2)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded border border-[#e2e8f0] bg-[#ffffff] px-2.5 py-2">
                <div className="text-[11px] text-[#64748b]">예상 22시 농도</div>
                <div className="text-sm font-bold text-[#0f172a] tabular-nums">
                  {activeCourse.predictedPm22.toFixed(1)} ㎍/㎥
                </div>
              </div>
              <div className="rounded border border-[#e2e8f0] bg-[#ffffff] px-2.5 py-2">
                <div className="text-[11px] text-[#64748b]">역전 발생 확률</div>
                <div
                  className={`text-sm font-bold tabular-nums ${
                    activeCourse.inversionProbPct >= 60
                      ? "text-[#dc2626]"
                      : activeCourse.inversionProbPct >= 35
                      ? "text-[#d97706]"
                      : "text-[#16a34a]"
                  }`}
                >
                  {activeCourse.inversionProbPct}%
                </div>
              </div>
            </div>
            {activeRegionMetric.stationPrediction && (
              <p className="text-[11px] text-[#475569]">
                주요 기여 요인:{" "}
                <strong className="text-[#0f172a]">
                  {activeRegionMetric.stationPrediction.topFactor}
                </strong>
              </p>
            )}
          </div>

          {/* Wind Speed & Inversion Status */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-md border border-[#e2e8f0] bg-[#ffffff] p-3 flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="text-[11px] text-[#64748b] inline-flex items-center gap-1">
                  <Wind className="w-3 h-3" />
                  야간 풍속 ({selectedHour}시)
                </div>
                <div className="text-sm font-bold text-[#0f172a] tabular-nums">
                  {activeCourse.windAtHour !== null
                    ? `${activeCourse.windAtHour.toFixed(1)} m/s`
                    : "자료 없음"}
                </div>
              </div>
              <span className="text-[11px] text-[#64748b]">
                {activeCourse.windAtHour !== null && activeCourse.windAtHour < 1.0
                  ? "대기 정체"
                  : "순환 양호"}
              </span>
            </div>

            <div className="rounded-md border border-[#e2e8f0] bg-[#ffffff] p-3 flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="text-[11px] text-[#64748b]">
                  역전층 발생 여부
                </div>
                <div
                  className={`text-sm font-bold tabular-nums ${
                    activeCourse.isInversion
                      ? "text-[#dc2626]"
                      : "text-[#16a34a]"
                  }`}
                >
                  {activeCourse.isInversion ? "발생" : "미발생"}
                </div>
              </div>
              <span className="text-[11px] text-[#64748b] tabular-nums">
                {activeCourse.diff >= 0 ? "+" : ""}
                {activeCourse.diff.toFixed(1)} ㎍/㎥
              </span>
            </div>
          </div>

          {/* 1-Hour Running Breathing Exposure */}
          <div className="rounded-md border border-[#e2e8f0] bg-[#f8fafc] p-3 space-y-1">
            <div className="text-xs font-semibold text-[#0f172a]">
              1시간 러닝 기준 호흡 노출 안내
            </div>
            <p className="text-xs text-[#334155] leading-relaxed">
              유산소 주행 시 분당 환기량은 안정 시 대비 약 2.5배 증가합니다. 현재
              선택 시각({selectedHour}시, {activeCourse.pmAtHour.toFixed(1)} ㎍/㎥)
              기준 1시간 야외 러닝 시{" "}
              <strong className="text-[#0f172a] tabular-nums">
                담배 약 {activeCourse.cigaretteEq.toFixed(1)}개비
              </strong>{" "}
              상당의 초미세먼지 흡입 노출 수준으로 추정됩니다.
            </p>
          </div>

          {/* Calm Actionable Guidance */}
          <div className="rounded-md border border-[#e2e8f0] bg-[#ffffff] p-3 space-y-1.5">
            <div className="text-xs font-semibold text-[#0f172a] inline-flex items-center gap-1.5">
              {activeCourse.status === "danger" ? (
                <AlertTriangle className="w-3.5 h-3.5 text-[#dc2626]" />
              ) : activeCourse.status === "caution" ? (
                <Info className="w-3.5 h-3.5 text-[#d97706]" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5 text-[#16a34a]" />
              )}
              행동 권고
            </div>
            <p className="text-xs text-[#475569] leading-relaxed">
              {activeCourse.status === "danger"
                ? `낮 14시(${activeCourse.pm14.toFixed(1)} ㎍/㎥) 대비 밤 22시(${activeCourse.pm22.toFixed(1)} ㎍/㎥) 농도가 상승하는 야간 역전 정체 구간입니다. 저지대 고강도 러닝을 중단하고 1순위 안전 우회 코스나 실내 운동으로 전환하시기 바랍니다.`
                : activeCourse.status === "caution"
                ? `대기 확산이 다소 둔화되는 시간대입니다. 호흡량이 급격히 늘어나는 인터벌 주행은 자제하고, 30분 내외의 가벼운 조깅 또는 상위 추천 코스를 이용하시기 바랍니다.`
                : `수평 환기 및 지형 순환이 유지되어 밤 시간대에도 초미세먼지 축적이 적은 구간입니다. 일반적인 야간 크루 러닝을 진행하기에 적합합니다.`}
            </p>
          </div>

          {/* Direct Detour Button to #1 Best Course */}
          {bestCourse &&
            bestCourse.variant.id !== activeCourse.variant.id &&
            activeCourse.status !== "safe" && (
              <button
                type="button"
                onClick={() => setSelectedCourseId(bestCourse.variant.id)}
                className="w-full py-2.5 px-3 rounded-md border border-[#bbf7d0] bg-[#f0fdf4] hover:bg-[#dcfce7] text-[#15803d] text-xs font-semibold flex items-center justify-between transition"
              >
                <span>
                  1순위 안전 추천 코스로 바로 이동 ({bestCourse.variant.name})
                </span>
                <ArrowRight className="w-4 h-4 shrink-0" />
              </button>
            )}
        </div>
      </div>
    </div>
  );
}
