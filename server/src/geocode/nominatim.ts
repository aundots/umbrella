const BASE = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'umbrella-weather/1.0';

interface NominatimAddress {
  city?: string;
  county?: string;
  borough?: string;
  town?: string;
  village?: string;
  suburb?: string;
  neighbourhood?: string;
  quarter?: string;
  road?: string;
  house_number?: string;
}

interface NominatimReverseResponse {
  display_name?: string;
  address?: NominatimAddress;
}

interface NominatimSearchItem {
  display_name: string;
  lat: string;
  lon: string;
  name?: string;
  address?: NominatimAddress;
}

export interface GeocodePlace {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

function formatAddress(address?: NominatimAddress, fallback?: string): string {
  if (!address) return fallback?.split(',')[0]?.trim() ?? '주소 없음';

  const region =
    address.city ??
    address.county ??
    address.borough ??
    address.town ??
    address.village;
  const district = address.suburb ?? address.neighbourhood ?? address.quarter;
  const street = [address.road, address.house_number].filter(Boolean).join(' ');

  return [region, district, street].filter(Boolean).join(' ') || fallback?.split(',')[0]?.trim() || '주소 없음';
}

function pickPlaceName(item: NominatimSearchItem): string {
  if (item.name?.trim()) return item.name.trim();
  const addr = formatAddress(item.address, item.display_name);
  return addr.split(' ')[0] ?? addr;
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

export async function reverseGeocode(lat: number, lng: number): Promise<GeocodePlace> {
  const data = await nominatimFetch<NominatimReverseResponse>(
    `/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=ko&zoom=18`,
  );
  const address = formatAddress(data.address, data.display_name);
  const name = address.split(' ').slice(-1)[0] ?? '현재 위치';
  return { name, address, lat, lng };
}

export async function searchPlaces(query: string): Promise<GeocodePlace[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const items = await nominatimFetch<NominatimSearchItem[]>(
    `/search?q=${encodeURIComponent(q)}&format=json&countrycodes=kr&limit=10&accept-language=ko`,
  );

  return items.map((item) => {
    const lat = Number(item.lat);
    const lng = Number(item.lon);
    const address = formatAddress(item.address, item.display_name);
    return {
      name: pickPlaceName(item),
      address,
      lat,
      lng,
    };
  }).filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lng));
}
