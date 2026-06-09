import {
  dedupePlaces,
  formatKoreanPlace,
  isAdminDivisionQuery,
  type KoreanAddressFields,
} from './korean.js';
import type { GeocodePlace } from './types.js';

export type { GeocodePlace } from './types.js';

const BASE = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'umbrella-weather/1.0';

interface NominatimReverseResponse {
  display_name?: string;
  address?: KoreanAddressFields;
}

interface NominatimSearchItem {
  display_name: string;
  lat: string;
  lon: string;
  name?: string;
  type?: string;
  class?: string;
  address?: KoreanAddressFields;
}

async function nominatimFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`geocode HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function nominatimItemToPlace(item: NominatimSearchItem): GeocodePlace | null {
  const lat = Number(item.lat);
  const lng = Number(item.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const { name, address } = formatKoreanPlace(item.address, item.display_name, item.name);
  return { name, address, lat, lng };
}

async function nominatimSearchQuery(q: string, limit = 20): Promise<GeocodePlace[]> {
  const params = new URLSearchParams({
    q,
    format: 'json',
    countrycodes: 'kr',
    limit: String(limit),
    'accept-language': 'ko',
    addressdetails: '1',
    dedupe: '0',
  });

  const items = await nominatimFetch<NominatimSearchItem[]>(`/search?${params}`);
  return items.map(nominatimItemToPlace).filter((p): p is GeocodePlace => p != null);
}

export async function searchNominatimPlaces(query: string): Promise<GeocodePlace[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const primary = await nominatimSearchQuery(q, 20);
  const merged = [...primary];

  if (isAdminDivisionQuery(q) && q.length >= 2) {
    const stem = q.replace(/(특별시|광역시|특별자치시|특별자치도|시|군|구|읍|면|동|리)$/, '').trim();
    if (stem.length >= 2 && stem !== q) {
      const extra = await nominatimSearchQuery(stem, 15);
      const needle = q.replace(/동$/, '');
      for (const place of extra) {
        if (place.address.includes(needle) || place.name.includes(needle)) {
          merged.push(place);
        }
      }
    }
  }

  return dedupePlaces(merged, 20);
}

export async function reverseGeocode(lat: number, lng: number): Promise<GeocodePlace> {
  const data = await nominatimFetch<NominatimReverseResponse>(
    `/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=ko&zoom=18&addressdetails=1`,
  );
  const { name, address } = formatKoreanPlace(data.address, data.display_name);
  const shortName = address.split(' ').slice(-1)[0] ?? name;
  return { name: shortName, address, lat, lng };
}
