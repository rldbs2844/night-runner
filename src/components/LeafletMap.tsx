"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import type { RegionConfig } from "@/lib/courses";
import type { TrafficStatus } from "@/lib/csvParser";

export interface MapCourseItem {
  regionId: string;
  regionLabel: string;
  mode: "primary" | "detour";
  courseId: string;
  courseName: string;
  distanceKm: number;
  pmAtHour: number;
  status: TrafficStatus;
  coordinates: [number, number][];
}

interface LeafletMapProps {
  regions: RegionConfig[];
  courses: MapCourseItem[];
  selectedRegionId: string;
  selectedMode: "primary" | "detour";
  onSelectCourse: (regionId: string, mode: "primary" | "detour") => void;
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

export default function LeafletMap({
  regions,
  courses,
  selectedRegionId,
  selectedMode,
  onSelectCourse,
}: LeafletMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const lastViewKeyRef = useRef<string>("");

  // Initialize Leaflet map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initialRegion =
      regions.find((r) => r.id === selectedRegionId) ?? regions[0];

    const map = L.map(containerRef.current, {
      center: initialRegion.center,
      zoom: initialRegion.zoom,
      zoomControl: true,
    });

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 19,
      }
    ).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = group;

    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Draw / update courses when data, hour, or selection changes
  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    courses.forEach((course) => {
      const isSelected =
        course.regionId === selectedRegionId && course.mode === selectedMode;
      const color = STATUS_COLOR[course.status];

      // Subtle white halo for readability over map roads
      if (isSelected) {
        L.polyline(course.coordinates, {
          color: "#ffffff",
          weight: 9,
          opacity: 0.9,
          lineCap: "round",
          lineJoin: "round",
        }).addTo(group);
      }

      const line = L.polyline(course.coordinates, {
        color,
        weight: isSelected ? 5.5 : 3.5,
        opacity: isSelected ? 0.95 : 0.65,
        dashArray: course.mode === "detour" && !isSelected ? "6 6" : undefined,
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
        onSelectCourse(course.regionId, course.mode);
      });

      const startPt = course.coordinates[0];
      const marker = L.circleMarker(startPt, {
        radius: isSelected ? 7 : 5,
        color: "#ffffff",
        weight: 2,
        fillColor: color,
        fillOpacity: 1,
      }).addTo(group);

      marker.bindTooltip(
        `${course.mode === "detour" ? "[우회] " : ""}${course.courseName}`,
        { direction: "top", offset: [0, -6] }
      );
      marker.on("click", () => {
        onSelectCourse(course.regionId, course.mode);
      });
    });

    // Pan/fit map when user switches region or course mode
    const viewKey = `${selectedRegionId}:${selectedMode}`;
    if (lastViewKeyRef.current !== viewKey) {
      lastViewKeyRef.current = viewKey;
      const activeCourse = courses.find(
        (c) => c.regionId === selectedRegionId && c.mode === selectedMode
      );
      if (activeCourse && activeCourse.coordinates.length > 0) {
        const bounds = L.latLngBounds(activeCourse.coordinates);
        map.fitBounds(bounds, { padding: [48, 48], maxZoom: 14, animate: true });
      } else {
        const reg = regions.find((r) => r.id === selectedRegionId);
        if (reg) map.setView(reg.center, reg.zoom, { animate: true });
      }
    }
  }, [courses, regions, selectedRegionId, selectedMode, onSelectCourse]);

  return (
    <div
      ref={containerRef}
      className="w-full h-[430px] sm:h-[490px] rounded-lg border border-[#e2e8f0] overflow-hidden"
      aria-label="야간 러닝 코스 지도"
    />
  );
}
