"use client";

import { useEffect, useRef, useState } from "react";
import type { MapCourseItem } from "@/components/LeafletMap";
import type { RegionConfig } from "@/lib/courses";
import type { TrafficStatus } from "@/lib/csvParser";

interface KakaoMapProps {
  kakaoKey: string;
  regions: RegionConfig[];
  courses: MapCourseItem[];
  selectedRegionId: string;
  selectedCourseId: string;
  onSelectCourse: (regionId: string, courseId: string) => void;
}

const STATUS_COLOR: Record<TrafficStatus, string> = {
  safe: "#16a34a",
  caution: "#d97706",
  danger: "#dc2626",
};

function haversineKm(a: [number, number], b: [number, number]): number {
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

function getDistanceMarkers(
  coords: [number, number][]
): { point: [number, number]; label: string }[] {
  if (coords.length < 2) return [];
  const markers: { point: [number, number]; label: string }[] = [
    { point: coords[0], label: "출발" },
  ];
  let accum = 0;
  let nextKm = 1;
  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1];
    const curr = coords[i];
    const seg = haversineKm(prev, curr);
    while (accum + seg >= nextKm && seg > 0) {
      const t = (nextKm - accum) / seg;
      markers.push({
        point: [
          prev[0] + (curr[0] - prev[0]) * t,
          prev[1] + (curr[1] - prev[1]) * t,
        ],
        label: `${nextKm}km`,
      });
      nextKm += 1;
    }
    accum += seg;
  }
  markers.push({ point: coords[coords.length - 1], label: "도착" });
  return markers;
}

export default function KakaoMap({
  kakaoKey,
  regions,
  courses,
  selectedRegionId,
  selectedCourseId,
  onSelectCourse,
}: KakaoMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const objectsRef = useRef<any[]>([]);
  const lastViewKeyRef = useRef<string>("");
  const [sdkReady, setSdkReady] = useState<boolean>(false);
  const [sdkError, setSdkError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = kakaoKey.trim();
    if (!trimmed) return;

    let cancelled = false;
    const scriptId = "kakao-maps-sdk";
    const existing = document.getElementById(
      scriptId
    ) as HTMLScriptElement | null;

    const initKakao = () => {
      if (cancelled || !window.kakao?.maps) return;
      window.kakao.maps.load(() => {
        if (cancelled || !containerRef.current || !window.kakao?.maps) return;
        const reg =
          regions.find((r) => r.id === selectedRegionId) ?? regions[0];
        const center = new window.kakao.maps.LatLng(
          reg.center[0],
          reg.center[1]
        );
        const map = new window.kakao.maps.Map(containerRef.current, {
          center,
          level: 5,
        });
        map.addControl(
          new window.kakao.maps.MapTypeControl(),
          window.kakao.maps.ControlPosition.TOPRIGHT
        );
        map.addControl(
          new window.kakao.maps.ZoomControl(),
          window.kakao.maps.ControlPosition.RIGHT
        );
        mapRef.current = map;
        lastViewKeyRef.current = "";
        setSdkError(null);
        setSdkReady(true);
      });
    };

    if (window.kakao?.maps && existing?.dataset.key === trimmed) {
      initKakao();
      return () => {
        cancelled = true;
      };
    }

    if (existing) {
      existing.remove();
      mapRef.current = null;
    }

    const script = document.createElement("script");
    script.id = scriptId;
    script.dataset.key = trimmed;
    script.async = true;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(
      trimmed
    )}&autoload=false`;
    script.onload = initKakao;
    script.onerror = () => {
      if (!cancelled) {
        setSdkReady(false);
        setSdkError(
          "카카오맵 SDK를 불러오지 못했습니다. JavaScript 앱 키와 카카오 디벨로퍼스의 JavaScript SDK 도메인(예: https://rldbs2844.github.io) 등록 여부를 확인해 주세요."
        );
      }
    };
    document.head.appendChild(script);

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kakaoKey]);

  useEffect(() => {
    const map = mapRef.current;
    const kakao = window.kakao?.maps;
    if (!sdkReady || !map || !kakao) return;

    objectsRef.current.forEach((obj) => obj.setMap(null));
    objectsRef.current = [];

    courses.forEach((course) => {
      const isSelected = course.courseId === selectedCourseId;
      const color = STATUS_COLOR[course.status];
      const path = course.coordinates.map(
        ([lat, lng]) => new kakao.LatLng(lat, lng)
      );

      if (isSelected) {
        const halo = new kakao.Polyline({
          path,
          strokeWeight: 9,
          strokeColor: "#ffffff",
          strokeOpacity: 0.92,
          strokeStyle: "solid",
        });
        halo.setMap(map);
        objectsRef.current.push(halo);
      }

      const polyline = new kakao.Polyline({
        path,
        strokeWeight: isSelected ? 5.5 : 3.2,
        strokeColor: color,
        strokeOpacity: isSelected ? 0.96 : 0.62,
        strokeStyle: !isSelected ? "shortdash" : "solid",
      });
      polyline.setMap(map);
      kakao.event.addListener(polyline, "click", () => {
        onSelectCourse(course.regionId, course.courseId);
      });
      objectsRef.current.push(polyline);

      if (isSelected) {
        const markers = getDistanceMarkers(course.coordinates);
        markers.forEach((dm, idx) => {
          const isEndpoint = idx === 0 || idx === markers.length - 1;
          const badge = document.createElement("div");
          badge.className = "km-marker-badge";
          badge.style.borderColor = isEndpoint ? color : "#cbd5e1";
          badge.style.color = isEndpoint ? color : "#0f172a";
          badge.textContent = dm.label;

          const overlay = new kakao.CustomOverlay({
            position: new kakao.LatLng(dm.point[0], dm.point[1]),
            content: badge,
            yAnchor: 1.25,
            zIndex: isEndpoint ? 4 : 3,
          });
          overlay.setMap(map);
          objectsRef.current.push(overlay);
        });
      } else if (course.regionId === selectedRegionId) {
        // Show clean clickable course labels for sibling routes in the active region
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "km-marker-badge cursor-pointer";
        btn.style.borderColor = color;
        btn.textContent = `${course.courseName} (${course.pmAtHour.toFixed(0)})`;
        btn.onclick = () => onSelectCourse(course.regionId, course.courseId);

        const midIdx = Math.floor(course.coordinates.length / 2);
        const pt = course.coordinates[midIdx] ?? course.coordinates[0];
        const overlay = new kakao.CustomOverlay({
          position: new kakao.LatLng(pt[0], pt[1]),
          content: btn,
          yAnchor: 1.2,
          zIndex: 2,
        });
        overlay.setMap(map);
        objectsRef.current.push(overlay);
      }
    });

    const viewKey = `${selectedRegionId}:${selectedCourseId}`;
    if (lastViewKeyRef.current !== viewKey) {
      lastViewKeyRef.current = viewKey;
      const activeCourse = courses.find(
        (c) => c.courseId === selectedCourseId
      );
      if (activeCourse && activeCourse.coordinates.length > 0) {
        const bounds = new kakao.LatLngBounds();
        activeCourse.coordinates.forEach(([lat, lng]) =>
          bounds.extend(new kakao.LatLng(lat, lng))
        );
        map.setBounds(bounds, 65, 65, 65, 65);
      }
    }
  }, [sdkReady, courses, selectedRegionId, selectedCourseId, onSelectCourse]);

  if (sdkError) {
    return (
      <div className="w-full h-[460px] sm:h-[530px] rounded-lg border border-[#fecaca] bg-[#fef2f2] p-6 flex flex-col items-center justify-center text-center gap-2">
        <p className="text-sm font-semibold text-[#b91c1c]">
          카카오맵 연결을 확인해 주세요
        </p>
        <p className="text-xs text-[#7f1d1d] max-w-md leading-relaxed">
          {sdkError}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-[460px] sm:h-[530px] rounded-lg border border-[#e2e8f0] overflow-hidden bg-[#f8fafc]"
      aria-label="카카오맵 야간 러닝 코스 지도"
    />
  );
}
