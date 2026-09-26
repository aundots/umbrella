import { getApiBaseUrl } from './api';

export interface GeocodePlace {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export async function reverseGeocode(lat: number, lng: number): Promise<GeocodePlace> {
  const base = getApiBaseUrl();
  const q = new URLSearchParams({ lat: String(lat), lng: String(lng) });
  const res = await fetch(`${base}/geocode/reverse?${q}`);
  if (!res.ok) throw new Error('주소를 불러오지 못했습니다');
  return res.json() as Promise<GeocodePlace>;
}

export async function searchPlaces(query: string): Promise<GeocodePlace[]> {
  const base = getApiBaseUrl();
  const q = new URLSearchParams({ q: query.trim() });
  const res = await fetch(`${base}/geocode/search?${q}`);
  if (!res.ok) throw new Error('지역 검색에 실패했습니다');
  const json = (await res.json()) as { results?: GeocodePlace[] };
  return json.results ?? [];
}
