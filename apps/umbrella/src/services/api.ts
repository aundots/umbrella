import { API_BASE_URL } from '../config';

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

export interface LiveRelayReport {
  locationId: string;
  locationName: string;
  observedAt: string;
  now: {
    precipitating: boolean;
    type: 'none' | 'rain' | 'snow' | 'mixed';
    rateMmH: number;
  };
  arrival: {
    willArrive: boolean;
    inMinutes: number | null;
    type: 'none' | 'rain' | 'snow' | 'mixed' | null;
    peakRateMmH: number;
  };
  end: {
    willStop: boolean;
    at: string | null;
    remainingMinutes: number | null;
  };
  confidence: number;
  relayStatus: 'live' | 'approaching' | 'clear';
  spatial: {
    resolutionM: number;
    awsDistanceM: number | null;
    dataSource: string;
  };
  terrain: {
    elevationM: number;
    exposure: string;
    effect: string;
    note: string | null;
  } | null;
  timeline: Array<{ offsetMin: number; rateMmH: number; type: string }>;
}

export interface SavedLocation {
  id: string;
  userKey: string;
  name: string;
  lat: number;
  lng: number;
  address?: string;
  notifyEnabled: boolean;
  notifyBeforeMin: 30 | 60;
}

export async function fetchRelay(
  lat: number,
  lng: number,
  name?: string,
): Promise<LiveRelayReport> {
  const base = getApiBaseUrl();
  const q = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    ...(name ? { name } : {}),
  });
  const res = await fetch(`${base}/relay?${q}`);
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<LiveRelayReport>;
}

export async function fetchLocations(userKey: string): Promise<SavedLocation[]> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/locations?userKey=${encodeURIComponent(userKey)}`);
  if (!res.ok) throw new Error('locations fetch failed');
  return res.json() as Promise<SavedLocation[]>;
}

export async function saveLocation(
  userKey: string,
  body: Omit<SavedLocation, 'id' | 'userKey'>,
): Promise<SavedLocation> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/locations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userKey, ...body }),
  });
  if (!res.ok) throw new Error('save location failed');
  return res.json() as Promise<SavedLocation>;
}

export async function sendTestPush(userKey: string): Promise<{ resultType?: string; error?: { reason?: string } }> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/toss/push/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userKey,
      context: { location: '테스트', minutes: '30', status: 'approaching' },
    }),
  });
  const json = (await res.json()) as { resultType?: string; error?: { reason?: string }; message?: string };
  if (!res.ok) {
    throw new Error(json.error?.reason ?? json.message ?? `HTTP ${res.status}`);
  }
  return json;
}

export async function registerUser(userKey: string, notifyConsent: boolean): Promise<void> {
  const base = getApiBaseUrl();
  await fetch(`${base}/users/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userKey, notifyConsent }),
  });
}

export async function deleteLocation(userKey: string, id: string): Promise<void> {
  const base = getApiBaseUrl();
  const res = await fetch(
    `${base}/locations/${id}?userKey=${encodeURIComponent(userKey)}`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error('delete location failed');
}

export async function updateLocationApi(
  userKey: string,
  id: string,
  patch: Partial<Pick<SavedLocation, 'name' | 'lat' | 'lng' | 'notifyEnabled' | 'notifyBeforeMin'>>,
): Promise<SavedLocation> {
  const base = getApiBaseUrl();
  const res = await fetch(
    `${base}/locations/${id}?userKey=${encodeURIComponent(userKey)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    },
  );
  if (!res.ok) throw new Error('update location failed');
  return res.json() as Promise<SavedLocation>;
}

export async function fetchRelayAll(userKey: string): Promise<LiveRelayReport[]> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/relay/all?userKey=${encodeURIComponent(userKey)}`);
  if (!res.ok) throw new Error('relay/all fetch failed');
  const json = (await res.json()) as { reports: LiveRelayReport[] };
  return json.reports ?? [];
}

export function formatTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function precipLabel(type: string | null): string {
  switch (type) {
    case 'rain':
      return '비';
    case 'snow':
      return '눈';
    case 'mixed':
      return '비/눈';
    default:
      return '없음';
  }
}

export function statusLabel(status: LiveRelayReport['relayStatus']): string {
  switch (status) {
    case 'live':
      return '비 내리는 중';
    case 'approaching':
      return '구름 접근 중';
    default:
      return '맑음';
  }
}
