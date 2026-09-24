import type { GeocodePlace } from './types.js';

export interface KoreanAddressFields {
  province?: string;
  city?: string;
  borough?: string;
  county?: string;
  town?: string;
  village?: string;
  suburb?: string;
  quarter?: string;
  neighbourhood?: string;
  road?: string;
  house_number?: string;
  railway?: string;
  highway?: string;
  building?: string;
  amenity?: string;
}

/** Juso addrCoordApi entX/entY (EPSG:5179 UTM-K, meters) → WGS84 */
export function utmkToWgs84(x: number, y: number): { lat: number; lng: number } {
  const a = 6378137.0;
  const f = 1 / 298.257222101;
  const e2 = 2 * f - f * f;
  const e4 = e2 * e2;
  const e6 = e4 * e2;

  const lon0 = (127.5 * Math.PI) / 180;
  const lat0 = (38 * Math.PI) / 180;
  const k0 = 0.9996;
  const x0 = 1_000_000;
  const y0 = 2_000_000;

  const M0 =
    a *
    ((1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * lat0 -
      ((3 * e2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * lat0) +
      ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * lat0) -
      ((35 * e6) / 3072) * Math.sin(6 * lat0));

  const M = M0 + (y - y0) / k0;
  const mu = M / (a * (1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256));

  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);

  const C1 = (e2 / (1 - e2)) * Math.cos(phi1) ** 2;
  const T1 = Math.tan(phi1) ** 2;
  const N1 = a / Math.sqrt(1 - e2 * Math.sin(phi1) ** 2);
  const R1 = (a * (1 - e2)) / (1 - e2 * Math.sin(phi1) ** 2) ** 1.5;
  const D = (x - x0) / (N1 * k0);

  const lat =
    phi1 -
    ((N1 * Math.tan(phi1)) / R1) *
      (D ** 2 / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * (e2 / (1 - e2))) * D ** 4) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * (e2 / (1 - e2)) - 3 * C1 ** 2) *
          D ** 6) /
          720);

  const lng =
    lon0 +
    (D -
      ((1 + 2 * T1 + C1) * D ** 3) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * (e2 / (1 - e2)) + 24 * T1 ** 2) * D ** 5) /
        120) /
      Math.cos(phi1);

  return { lat: (lat * 180) / Math.PI, lng: (lng * 180) / Math.PI };
}

function parseDisplayName(displayName?: string): string {
  if (!displayName) return '주소 없음';
  const parts = displayName
    .split(',')
    .map((s) => s.trim())
    .filter((p) => p && p !== '대한민국' && !/^\d{5}$/.test(p));
  return parts.slice(0, 5).join(' ') || '주소 없음';
}

function shortenSiDo(name: string): string {
  return name
    .replace('특별자치도', '')
    .replace('특별자치시', '')
    .replace('특별시', '')
    .replace('광역시', '')
    .trim();
}

export function formatKoreanPlace(
  address: KoreanAddressFields | undefined,
  displayName: string | undefined,
  featureName?: string,
): { name: string; address: string } {
  const si = address?.city ?? address?.province ?? '';
  const gu = address?.borough ?? address?.county ?? '';
  const dong =
    address?.suburb ?? address?.quarter ?? address?.neighbourhood ?? address?.town ?? '';
  const road = [address?.road, address?.house_number].filter(Boolean).join(' ');

  const addressParts = [si, gu, dong, road].filter(Boolean);
  const fullAddress = addressParts.length > 0 ? addressParts.join(' ') : parseDisplayName(displayName);

  const poi =
    featureName?.trim() ||
    address?.railway ||
    address?.highway ||
    address?.building ||
    address?.amenity ||
    '';

  const context = [shortenSiDo(si), gu, dong].filter(Boolean).join(' ');
  let name = poi || dong || gu || shortenSiDo(si) || fullAddress.split(' ')[0] || '위치';

  if (poi && context && !name.includes(gu) && !name.includes(dong)) {
    const ctxShort = [gu, dong].filter(Boolean).join(' ');
    if (ctxShort) name = `${poi} (${ctxShort})`;
  } else if (!poi && gu && dong) {
    name = `${dong} · ${gu}`;
  } else if (!poi && gu) {
    name = gu;
  }

  return { name, address: fullAddress };
}

export function dedupePlaces(places: GeocodePlace[], limit = 20): GeocodePlace[] {
  const seen = new Set<string>();
  const out: GeocodePlace[] = [];

  for (const place of places) {
    const key = `${place.lat.toFixed(4)}:${place.lng.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(place);
    if (out.length >= limit) break;
  }

  return out;
}

export function isRoadOrJibunQuery(q: string): boolean {
  return (
    /\d/.test(q) ||
    /(로|길|동|가|리)\s*\d/.test(q) ||
    /^\S+(로|길)\s*\d+/.test(q) ||
    /\d+-\d+/.test(q)
  );
}

export function isAdminDivisionQuery(q: string): boolean {
  return /(구|동|읍|면|리|시|군)$/.test(q.trim());
}
