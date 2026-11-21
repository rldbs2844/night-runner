"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import type { RegionConfig } from "@/lib/courses";
import type { TrafficStatus } from "@/lib/csvParser";

export type MapProvider =
  | "osm"
  | "vworld-base"
  | "vworld-hybrid"
  | "maptiler-positron";

export interface MapCourseItem {
  regionId: string;
  regionLabel: string;
  courseId: string;
  courseName: string;
  distanceKm: number;
  pmAtHour: number;
  status: TrafficStatus;
  isWindCorridor: boolean;
  coordinates: [number, number][];
}

interface LeafletMapProps {
  regions: RegionConfig[];
  courses: MapCourseItem[];
  selectedRegionId: string;
  selectedCourseId: string;
  mapProvider: MapProvider;
  vworldKey: string;
  maptilerKey: string;
  onSelectCourse: (regionId: string, courseId: string) => void;
}

const STATUS_COLOR: Record<TrafficStatus, string> = {
  safe: "#16a34a",
  caution: "#d97706",
  danger: "#dc2626",
};

const STATUS_LABEL: Record<TrafficStatus, string> = {
  safe: "안전",
  caution: "주의",
  danger: "역전 정체 위험",
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
      const lat = prev[0] + (curr[0] - prev[0]) * t;
      const lng = prev[1] + (curr[1] - prev[1]) * t;
      markers.push({ point: [lat, lng], label: `${nextKm}km` });
      nextKm += 1;
    }
    accum += seg;
  }

  markers.push({ point: coords[coords.length - 1], label: "도착" });
  return markers;
}

export default function LeafletMap({
  regions,
  courses,
  selectedRegionId,
  selectedCourseId,
  mapProvider,
  vworldKey,
  maptilerKey,
  onSelectCourse,
}: LeafletMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileGroupRef = useRef<L.LayerGroup | null>(null);
  const courseGroupRef = useRef<L.LayerGroup | null>(null);
  const lastViewKeyRef = useRef<string>("");

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initialRegion =
      regions.find((r) => r.id === selectedRegionId) ?? regions[0];

    const map = L.map(containerRef.current, {
      center: initialRegion.center,
      zoom: initialRegion.zoom,
      zoomControl: true,
    });

    tileGroupRef.current = L.layerGroup().addTo(map);
    courseGroupRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      tileGroupRef.current = null;
      courseGroupRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const tileGroup = tileGroupRef.current;
    const el = containerRef.current;
    if (!map || !tileGroup || !el) return;

    tileGroup.clearLayers();

    const effectiveProvider: MapProvider =
      (mapProvider === "vworld-base" || mapProvider === "vworld-hybrid") &&
      !vworldKey.trim()
        ? "osm"
        : mapProvider === "maptiler-positron" && !maptilerKey.trim()
        ? "osm"
        : mapProvider;

    el.classList.toggle("osm-muted", effectiveProvider === "osm");

    if (effectiveProvider === "vworld-base") {
      L.tileLayer(
        `https://api.vworld.kr/req/wmts/1.0.0/${vworldKey.trim()}/Base/{z}/{y}/{x}.png`,
        {
          attribution: "&copy; 국토교통부 브이월드(VWORLD)",
          maxZoom: 19,
          minZoom: 6,
        }
      ).addTo(tileGroup);
    } else if (effectiveProvider === "vworld-hybrid") {
      L.tileLayer(
        `https://api.vworld.kr/req/wmts/1.0.0/${vworldKey.trim()}/Satellite/{z}/{y}/{x}.jpeg`,
        {
          attribution: "&copy; 국토교통부 브이월드(VWORLD)",
          maxZoom: 19,
          minZoom: 6,
        }
      ).addTo(tileGroup);
      L.tileLayer(
        `https://api.vworld.kr/req/wmts/1.0.0/${vworldKey.trim()}/Hybrid/{z}/{y}/{x}.png`,
        {
          maxZoom: 19,
          minZoom: 6,
        }
      ).addTo(tileGroup);
    } else if (effectiveProvider === "maptiler-positron") {
      L.tileLayer(
        `https://api.maptiler.com/maps/positron/256/{z}/{x}/{y}@2x.png?key=${maptilerKey.trim()}`,
        {
          attribution:
            '&copy; <a href="https://www.maptiler.com/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }
      ).addTo(tileGroup);
    } else {
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(tileGroup);
    }
  }, [mapProvider, vworldKey, maptilerKey]);

  useEffect(() => {
    const map = mapRef.current;
    const group = courseGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    courses.forEach((course) => {
      const isSelected = course.courseId === selectedCourseId;
      const color = STATUS_COLOR[course.status];

      if (isSelected) {
        L.polyline(course.coordinates, {
          color: "#ffffff",
          weight: 9,
          opacity: 0.92,
          lineCap: "round",
          lineJoin: "round",
        }).addTo(group);
      }

      const line = L.polyline(course.coordinates, {
        color,
        weight: isSelected ? 5.5 : 3.2,
        opacity: isSelected ? 0.96 : 0.62,
        dashArray: !isSelected ? "6 6" : undefined,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(group);

      line.bindTooltip(
        `${course.courseName} · ${course.pmAtHour.toFixed(1)} ㎍/㎥ (${
          STATUS_LABEL[course.status]
        })`,
        { sticky: true }
      );

      line.on("click", () => {
        onSelectCourse(course.regionId, course.courseId);
      });

      if (isSelected) {
        const distMarkers = getDistanceMarkers(course.coordinates);
        distMarkers.forEach((dm, idx) => {
          const isEndpoint = idx === 0 || idx === distMarkers.length - 1;
          L.circleMarker(dm.point, {
            radius: isEndpoint ? 6 : 4,
            color: "#ffffff",
            weight: 2,
            fillColor: color,
            fillOpacity: 1,
          }).addTo(group);

          L.marker(dm.point, {
            interactive: false,
            icon: L.divIcon({
              className: "",
              html: `<div class="km-marker-badge">${dm.label}</div>`,
              iconSize: [42, 18],
              iconAnchor: [-6, 9],
            }),
          }).addTo(group);
        });
      } else {
        const startPt = course.coordinates[0];
        const marker = L.circleMarker(startPt, {
          radius: 5,
          color: "#ffffff",
          weight: 2,
          fillColor: color,
          fillOpacity: 1,
        }).addTo(group);

        marker.bindTooltip(
          `${course.courseName} (${course.pmAtHour.toFixed(1)} ㎍/㎥)`,
          { direction: "top", offset: [0, -6] }
        );
        marker.on("click", () => {
          onSelectCourse(course.regionId, course.courseId);
        });
      }
    });

    const viewKey = `${selectedRegionId}:${selectedCourseId}`;
    if (lastViewKeyRef.current !== viewKey) {
      lastViewKeyRef.current = viewKey;
      const activeCourse = courses.find(
        (c) => c.courseId === selectedCourseId
      );
      if (activeCourse && activeCourse.coordinates.length > 0) {
        const bounds = L.latLngBounds(activeCourse.coordinates);
        map.fitBounds(bounds, { padding: [52, 52], maxZoom: 14, animate: true });
      } else {
        const reg = regions.find((r) => r.id === selectedRegionId);
        if (reg) map.setView(reg.center, reg.zoom, { animate: true });
      }
    }
  }, [courses, regions, selectedRegionId, selectedCourseId, onSelectCourse]);

  return (
    <div
      ref={containerRef}
      className="w-full h-[460px] sm:h-[530px] rounded-lg border border-[#e2e8f0] overflow-hidden"
      aria-label="야간 러닝 코스 지도"
    />
  );
}
