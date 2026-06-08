import { windFromComponents } from '../kma/client.js';
import { FcstSlot, PrecipType } from '../kma/types.js';

export interface TerrainContext {
  elevationM: number;
  slopeDeg: number;
  exposure: 'windward' | 'leeward' | 'neutral';
  effect: 'enhanced' | 'delayed' | 'blocked' | 'none';
  note: string | null;
}

/** MVP: 고도 lookup 테이블 (서울 주요 지점) + 풍향 기반 보정 */
const ELEVATION_SAMPLES: Array<{ lat: number; lng: number; elev: number; name: string }> = [
  { lat: 37.5665, lng: 126.978, elev: 40, name: '서울시청' },
  { lat: 37.4979, lng: 127.0276, elev: 35, name: '강남' },
  { lat: 37.5796, lng: 126.977, elev: 120, name: '북한산자락' },
  { lat: 37.4449, lng: 126.9536, elev: 180, name: '관악산' },
  { lat: 37.5326, lng: 127.0247, elev: 25, name: '한강변' },
];

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function lookupElevation(lat: number, lng: number): { elevationM: number; slopeDeg: number } {
  let nearest = ELEVATION_SAMPLES[0];
  let minDist = Infinity;
  for (const s of ELEVATION_SAMPLES) {
    const d = haversineKm(lat, lng, s.lat, s.lng);
    if (d < minDist) {
      minDist = d;
      nearest = s;
    }
  }
  const slopeDeg = nearest.elev > 100 ? 8 : nearest.elev > 60 ? 4 : 1;
  return { elevationM: nearest.elev, slopeDeg };
}

function approachBearing(fromLat: number, fromLng: number, toLat: number, toLng: number): number {
  const dLng = ((toLng - fromLng) * Math.PI) / 180;
  const lat1 = (fromLat * Math.PI) / 180;
  const lat2 = (toLat * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function computeTerrainContext(
  lat: number,
  lng: number,
  windDeg: number | null,
  echoFrom?: { lat: number; lng: number } | null,
): TerrainContext {
  const { elevationM, slopeDeg } = lookupElevation(lat, lng);

  if (!windDeg && !echoFrom) {
    return {
      elevationM,
      slopeDeg,
      exposure: 'neutral',
      effect: 'none',
      note: null,
    };
  }

  const bearing = echoFrom
    ? approachBearing(echoFrom.lat, echoFrom.lng, lat, lng)
    : windDeg!;

  const mountain = ELEVATION_SAMPLES.filter((s) => s.elev > 100)
    .sort((a, b) => haversineKm(lat, lng, a.lat, a.lng) - haversineKm(lat, lng, b.lat, b.lng))[0];

  if (mountain && haversineKm(lat, lng, mountain.lat, mountain.lng) < 3) {
    const mBearing = approachBearing(mountain.lat, mountain.lng, lat, lng);
    const diff = Math.abs(((bearing - mBearing + 180) % 360) - 180);

    if (diff < 45 && elevationM < mountain.elev - 80) {
      return {
        elevationM,
        slopeDeg,
        exposure: 'leeward',
        effect: 'delayed',
        note: `${mountain.name} 풍하 — 도달 지연·약화 가능`,
      };
    }
    if (diff > 135) {
      return {
        elevationM,
        slopeDeg,
        exposure: 'windward',
        effect: 'enhanced',
        note: `${mountain.name} 풍상 — 강수 강화 가능`,
      };
    }
  }

  if (elevationM > 100) {
    return {
      elevationM,
      slopeDeg,
      exposure: 'windward',
      effect: 'enhanced',
      note: '고지대 — 강수 먼저 시작될 수 있음',
    };
  }

  return { elevationM, slopeDeg, exposure: 'neutral', effect: 'none', note: null };
}

export interface TerrainAdjustResult {
  peakRateMmH: number;
  inMinutes: number | null;
  endAt: Date | null;
  confidenceDelta: number;
  willArrive: boolean;
}

export function applyTerrainAdjust(
  terrain: TerrainContext,
  peakRateMmH: number,
  inMinutes: number | null,
  endAt: Date | null,
  willArrive: boolean,
): TerrainAdjustResult {
  let rate = peakRateMmH;
  let mins = inMinutes;
  let end = endAt;
  let conf = 0;
  let arrive = willArrive;

  switch (terrain.effect) {
    case 'enhanced':
      rate *= 1.2;
      if (mins != null) mins = Math.max(0, mins - 5);
      conf += 5;
      break;
    case 'delayed':
      rate *= 0.6;
      if (mins != null) mins += 15;
      conf -= 10;
      break;
    case 'blocked':
      conf -= 20;
      if (rate < 1) arrive = false;
      break;
    default:
      break;
  }

  return { peakRateMmH: rate, inMinutes: mins, endAt: end, confidenceDelta: conf, willArrive: arrive };
}

export function getWindFromFcst(slots: FcstSlot[]): number | null {
  const now = new Date();
  const slot = slots.find((s) => s.at >= now) ?? slots[0];
  if (!slot) return null;
  return windFromComponents(slot.uuu, slot.vvv);
}
