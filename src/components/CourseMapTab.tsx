"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowRight, Wind, Clock, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { REGIONS, type RegionConfig } from "@/lib/courses";
import {
  classifyCourseStatus,
  type StationSummary,
  type TrafficStatus,
} from "@/lib/csvParser";
import type { MapCourseItem } from "@/components/LeafletMap";

const LeafletMap = dynamic(() => import("@/components/LeafletMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[430px] sm:h-[490px] rounded-lg border border-[#e2e8f0] bg-[#f8fafc] flex items-center justify-center text-sm text-[#64748b]">
      지도를 불러오는 중입니다...
    </div>
  ),
});

interface CourseMapTabProps {
  stationSummaries: StationSummary[];
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

export default function CourseMapTab({ stationSummaries }: CourseMapTabProps) {
  const [selectedHour, setSelectedHour] = useState<number>(22);
  const [selectedRegionId, setSelectedRegionId] = useState<string>("dongducheon");
  const [selectedMode, setSelectedMode] = useState<"primary" | "detour">("primary");

  const summaryMap = useMemo(() => {
    const map = new Map<string, StationSummary>();
    stationSummaries.forEach((s) => map.set(s.station, s));
    return map;
  }, [stationSummaries]);

  // Compute live course metrics for all 6 regions at selectedHour
  const regionMetrics = useMemo(() => {
    return REGIONS.map((region) => {
      const st = summaryMap.get(region.stationName);
      const basePm14 = st?.pm14 ?? 21.0;
      const basePm22 = st?.pm22 ?? 21.0;
      const basePmAtHour = st?.hourlyPm25[selectedHour] ?? basePm22;
      const baseWindAtHour =
        st?.hourlyWind[selectedHour] ?? st?.wind22 ?? 1.2;
      const baseWind22 = st?.wind22 ?? baseWindAtHour;

      const computeCourseStats = (
        mode: "primary" | "detour",
        variant: RegionConfig["primaryCourse"]
      ) => {
        const pm14 = Math.round(basePm14 * variant.exposureFactor * 10) / 10;
        const pm22 = Math.round(basePm22 * variant.exposureFactor * 10) / 10;
        const pmAtHour =
          Math.round(basePmAtHour * variant.exposureFactor * 10) / 10;
        const diff = Math.round((pm22 - pm14) * 10) / 10;
        const isInversion = pm14 < pm22;
        const windAtHour =
          baseWindAtHour !== null
            ? Math.round(baseWindAtHour * variant.windFactor * 10) / 10
            : null;
        const wind22 =
          baseWind22 !== null
            ? Math.round(baseWind22 * variant.windFactor * 10) / 10
            : null;
        const status = classifyCourseStatus(
          pmAtHour,
          isInversion,
          diff,
          selectedHour
        );
        const cigaretteEq = Math.max(0.2, Math.round((pmAtHour / 16.5) * 10) / 10);

        return {
          mode,
          variant,
          pm14,
          pm22,
          pmAtHour,
          diff,
          isInversion,
          windAtHour,
          wind22,
          status,
          cigaretteEq,
        };
      };

      const primary = computeCourseStats("primary", region.primaryCourse);
      const detour = computeCourseStats("detour", region.safeDetourCourse);

      return { region, stationSummary: st, primary, detour };
    });
  }, [summaryMap, selectedHour]);

  const mapCourses: MapCourseItem[] = useMemo(() => {
    const items: MapCourseItem[] = [];
    regionMetrics.forEach(({ region, primary, detour }) => {
      items.push({
        regionId: region.id,
        regionLabel: region.label,
        mode: "primary",
        courseId: primary.variant.id,
        courseName: primary.variant.name,
        distanceKm: primary.variant.distanceKm,
        pmAtHour: primary.pmAtHour,
        status: primary.status,
        coordinates: primary.variant.coordinates,
      });
      items.push({
        regionId: region.id,
        regionLabel: region.label,
        mode: "detour",
        courseId: detour.variant.id,
        courseName: detour.variant.name,
        distanceKm: detour.variant.distanceKm,
        pmAtHour: detour.pmAtHour,
        status: detour.status,
        coordinates: detour.variant.coordinates,
      });
    });
    return items;
  }, [regionMetrics]);

  const activeRegionMetric =
    regionMetrics.find((m) => m.region.id === selectedRegionId) ??
    regionMetrics[0];
  const activeCourse =
    selectedMode === "primary"
      ? activeRegionMetric.primary
      : activeRegionMetric.detour;
  const activeBadge = STATUS_BADGE[activeCourse.status];

  const handleSelectRegion = (regionId: string) => {
    setSelectedRegionId(regionId);
    setSelectedMode("primary");
  };

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
              <span className="font-semibold text-[#0f172a]">21~22시 (역전 피크)</span>
              <span>23시</span>
            </div>
          </div>

          {/* 6 Region Buttons */}
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-[#475569]">
              권역별 코스 선택
            </div>
            <div className="flex flex-wrap gap-1.5">
              {regionMetrics.map(({ region, primary }) => {
                const isSelected = region.id === selectedRegionId;
                const badge = STATUS_BADGE[primary.status];
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
        {/* Left: Leaflet Map */}
        <div className="lg:col-span-7 bg-[#ffffff] border border-[#e2e8f0] rounded-lg p-3 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <div className="text-xs font-semibold text-[#0f172a]">
              {activeRegionMetric.region.label} 권역 코스 지도
              <span className="ml-2 font-normal text-[#64748b]">
                ({activeRegionMetric.region.terrainSummary})
              </span>
            </div>
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

          <LeafletMap
            regions={REGIONS}
            courses={mapCourses}
            selectedRegionId={selectedRegionId}
            selectedMode={selectedMode}
            onSelectCourse={(regionId, mode) => {
              setSelectedRegionId(regionId);
              setSelectedMode(mode);
            }}
          />

          <p className="text-[11px] text-[#64748b] px-1">
            실선은 현재 선택 코스, 점선은 동일 권역 내 비교 코스입니다. 지도 위 노선이나 시작 지점을 클릭해 전환할 수 있습니다.
          </p>
        </div>

        {/* Right: Course Detail & Action Guidance */}
        <div className="lg:col-span-5 bg-[#ffffff] border border-[#e2e8f0] rounded-lg p-4 space-y-4">
          {/* Course Variant Switcher */}
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-md bg-[#f8fafc] border border-[#e2e8f0]">
            <button
              type="button"
              onClick={() => setSelectedMode("primary")}
              className={`py-1.5 px-2.5 rounded text-xs font-medium transition flex items-center justify-center gap-1.5 ${
                selectedMode === "primary"
                  ? "bg-[#ffffff] text-[#0f172a] border border-[#e2e8f0] shadow-xs"
                  : "text-[#64748b] hover:text-[#0f172a]"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  STATUS_BADGE[activeRegionMetric.primary.status].dot
                }`}
              />
              주 코스
            </button>
            <button
              type="button"
              onClick={() => setSelectedMode("detour")}
              className={`py-1.5 px-2.5 rounded text-xs font-medium transition flex items-center justify-center gap-1.5 ${
                selectedMode === "detour"
                  ? "bg-[#ffffff] text-[#0f172a] border border-[#e2e8f0] shadow-xs"
                  : "text-[#64748b] hover:text-[#0f172a]"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  STATUS_BADGE[activeRegionMetric.detour.status].dot
                }`}
              />
              안전 우회 코스
            </button>
          </div>

          {/* Course Title & Status Badge */}
          <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#e2e8f0]">
            <div className="space-y-1">
              <div className="text-xs text-[#64748b]">
                측정소 기준: {activeRegionMetric.region.stationName} ·{" "}
                {activeCourse.variant.distanceKm.toFixed(1)} km
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

          {/* 14시 vs 22시 PM2.5 Comparison + Current Hour */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-[#475569]">
              초미세먼지(PM2.5) 시간대 비교
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
              선택 시각({selectedHour}시, {activeCourse.pmAtHour.toFixed(1)} ㎍/㎥) 기준
              1시간 야외 러닝 시{" "}
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
                ? `낮 14시(${activeCourse.pm14.toFixed(1)} ㎍/㎥) 대비 밤 22시(${activeCourse.pm22.toFixed(1)} ㎍/㎥) 농도가 상승하는 야간 역전 정체 구간입니다. 저지대 고강도 러닝을 중단하고 고도가 높은 우회 코스나 실내 운동으로 전환하시기 바랍니다.`
                : activeCourse.status === "caution"
                ? `대기 확산이 다소 둔화되는 시간대입니다. 호흡량이 급격히 늘어나는 인터벌 주행은 자제하고, 30분 내외의 가벼운 조깅 또는 바람길 우회 코스를 이용하시기 바랍니다.`
                : `수평 환기가 유지되어 밤 시간대에도 초미세먼지 축적이 적은 구간입니다. 일반적인 야간 크루 러닝을 진행하기에 적합합니다.`}
            </p>
          </div>

          {/* Direct Detour Button when Danger Course is Selected */}
          {activeCourse.status === "danger" && selectedMode === "primary" && (
            <button
              type="button"
              onClick={() => setSelectedMode("detour")}
              className="w-full py-2.5 px-3 rounded-md border border-[#bbf7d0] bg-[#f0fdf4] hover:bg-[#dcfce7] text-[#15803d] text-xs font-semibold flex items-center justify-between transition"
            >
              <span>
                같은 권역 안전 우회 코스로 바로 이동 (
                {activeRegionMetric.detour.variant.name})
              </span>
              <ArrowRight className="w-4 h-4 shrink-0" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
