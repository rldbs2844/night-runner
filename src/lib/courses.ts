export interface CourseVariant {
  id: string;
  name: string;
  distanceKm: number;
  terrainNote: string;
  /** Factor applied to station PM2.5 reflecting micro-topography (lowland stagnation vs elevated/coastal wind corridor) */
  exposureFactor: number;
  windFactor: number;
  coordinates: [number, number][];
}

export interface RegionConfig {
  id: string;
  label: string;
  stationName: string;
  center: [number, number];
  zoom: number;
  terrainSummary: string;
  primaryCourse: CourseVariant;
  safeDetourCourse: CourseVariant;
}

export const REGIONS: RegionConfig[] = [
  {
    id: "dongducheon",
    label: "동두천",
    stationName: "동두천",
    center: [37.909, 127.061],
    zoom: 13,
    terrainSummary: "산간 분지 및 신천 저지대",
    primaryCourse: {
      id: "dongducheon-primary",
      name: "신천 둔치 저지대 러닝 코스",
      distanceKm: 5.0,
      terrainNote: "하천 저지대 · 야간 찬 공기 침강 정체 구간",
      exposureFactor: 1.06,
      windFactor: 0.85,
      coordinates: [
        [37.8915, 127.0532],
        [37.8982, 127.0556],
        [37.9056, 127.0568],
        [37.9134, 127.0581],
        [37.9212, 127.0598],
      ],
    },
    safeDetourCourse: {
      id: "dongducheon-detour",
      name: "소요산 입구·지행 능선 바람길",
      distanceKm: 4.2,
      terrainNote: "표고 상승 구간 · 산곡풍 순환으로 역전층 회피",
      exposureFactor: 0.45,
      windFactor: 1.45,
      coordinates: [
        [37.8955, 127.0665],
        [37.9045, 127.0715],
        [37.9152, 127.0748],
        [37.9255, 127.0712],
        [37.9342, 127.0645],
      ],
    },
  },
  {
    id: "yeouido",
    label: "여의도 한강",
    stationName: "서울",
    center: [37.5295, 126.942],
    zoom: 13,
    terrainSummary: "한강 수변 개방 바람길",
    primaryCourse: {
      id: "yeouido-primary",
      name: "여의도~반포 한강 수변 바람길",
      distanceKm: 6.0,
      terrainNote: "강변 주 풍로 · 야간 수평 환기 원활",
      exposureFactor: 0.78,
      windFactor: 1.25,
      coordinates: [
        [37.5335, 126.9185],
        [37.5282, 126.9332],
        [37.5218, 126.9495],
        [37.5162, 126.9688],
        [37.5122, 126.9895],
      ],
    },
    safeDetourCourse: {
      id: "yeouido-detour",
      name: "샛강 생태공원~여의서로 순환길",
      distanceKm: 4.5,
      terrainNote: "개방 수변 순환 · 정체 시 우회 가능 구간",
      exposureFactor: 0.68,
      windFactor: 1.3,
      coordinates: [
        [37.5262, 126.9178],
        [37.5198, 126.9242],
        [37.5186, 126.9345],
        [37.5245, 126.9388],
        [37.5308, 126.9295],
      ],
    },
  },
  {
    id: "daegu",
    label: "대구 수성못",
    stationName: "대구",
    center: [35.8235, 128.606],
    zoom: 13,
    terrainSummary: "분지 내 호수·하천 저지대",
    primaryCourse: {
      id: "daegu-primary",
      name: "수성못~신천 분지 저지대 코스",
      distanceKm: 5.4,
      terrainNote: "분지 저지대 · 야간 복사냉각 정체 심화",
      exposureFactor: 1.05,
      windFactor: 0.85,
      coordinates: [
        [35.8268, 128.6135],
        [35.8285, 128.6202],
        [35.8242, 128.6215],
        [35.8238, 128.6132],
        [35.8268, 128.6135],
      ],
    },
    safeDetourCourse: {
      id: "daegu-detour",
      name: "앞산 자락 고지대 순환길",
      distanceKm: 4.6,
      terrainNote: "산지 경사면 · 저지대 역전층 상단 회피",
      exposureFactor: 0.46,
      windFactor: 1.4,
      coordinates: [
        [35.8215, 128.5745],
        [35.8172, 128.5842],
        [35.8148, 128.5945],
        [35.8165, 128.6038],
      ],
    },
  },
  {
    id: "chuncheon",
    label: "춘천 의암호",
    stationName: "춘천",
    center: [37.878, 127.712],
    zoom: 13,
    terrainSummary: "호수 분지 지형",
    primaryCourse: {
      id: "chuncheon-primary",
      name: "의암호·공지천 수변 저지대 코스",
      distanceKm: 5.2,
      terrainNote: "호수 습기 및 분지 냉기 정체 구간",
      exposureFactor: 1.06,
      windFactor: 0.8,
      coordinates: [
        [37.8685, 127.7052],
        [37.8732, 127.7138],
        [37.8768, 127.7212],
        [37.8825, 127.7175],
      ],
    },
    safeDetourCourse: {
      id: "chuncheon-detour",
      name: "봉의산·소양강 개방 능선길",
      distanceKm: 4.5,
      terrainNote: "개방 지형 · 야간 대류 혼합 유지 구간",
      exposureFactor: 0.48,
      windFactor: 1.4,
      coordinates: [
        [37.8842, 127.7245],
        [37.8895, 127.7292],
        [37.8935, 127.7365],
        [37.8898, 127.7438],
      ],
    },
  },
  {
    id: "daejeon",
    label: "대전 갑천",
    stationName: "대전",
    center: [36.3755, 127.3865],
    zoom: 13,
    terrainSummary: "내륙 평지 하천 구간",
    primaryCourse: {
      id: "daejeon-primary",
      name: "갑천·유등천 합류 저지대 코스",
      distanceKm: 4.8,
      terrainNote: "하천 합류부 · 무풍 시 약한 역전 발생",
      exposureFactor: 1.02,
      windFactor: 0.95,
      coordinates: [
        [36.3652, 127.3925],
        [36.3708, 127.3948],
        [36.3755, 127.3895],
        [36.3792, 127.3822],
      ],
    },
    safeDetourCourse: {
      id: "daejeon-detour",
      name: "엑스포다리~대덕대로 개방 수변길",
      distanceKm: 5.5,
      terrainNote: "넓은 하폭 개방 구간 · 풍속 확보 시 쾌적",
      exposureFactor: 0.72,
      windFactor: 1.25,
      coordinates: [
        [36.3742, 127.3882],
        [36.3788, 127.3765],
        [36.3822, 127.3652],
        [36.3855, 127.3548],
      ],
    },
  },
  {
    id: "busan",
    label: "부산 해운대",
    stationName: "부산",
    center: [35.158, 129.148],
    zoom: 13,
    terrainSummary: "해안 해풍 순환 지형",
    primaryCourse: {
      id: "busan-primary",
      name: "해운대~동백섬~광안리 해안 바람길",
      distanceKm: 6.5,
      terrainNote: "해풍 지속 순환 · 야간 농도 하강 안전 구간",
      exposureFactor: 0.85,
      windFactor: 1.2,
      coordinates: [
        [35.1592, 129.1665],
        [35.1578, 129.1582],
        [35.1538, 129.1525],
        [35.1562, 129.1385],
        [35.1532, 129.1195],
      ],
    },
    safeDetourCourse: {
      id: "busan-detour",
      name: "달맞이길 해안 능선 바람길",
      distanceKm: 4.3,
      terrainNote: "해안 고지대 · 최상위 대기 환기 구간",
      exposureFactor: 0.72,
      windFactor: 1.3,
      coordinates: [
        [35.1585, 129.1695],
        [35.1598, 129.1778],
        [35.1618, 129.1852],
        [35.1645, 129.1912],
      ],
    },
  },
];
