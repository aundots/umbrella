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
    soon: boolean;
  };
  confidence: number;
  relayStatus: 'live' | 'approaching' | 'clear';
  spatial: {
    resolutionM: number;
    awsDistanceM: number | null;
    dataSource: 'aws' | 'hsr' | 'blended' | 'fcst';
  };
  terrain: {
    elevationM: number;
    exposure: string;
    effect: string;
    note: string | null;
  } | null;
  timeline: Array<{ offsetMin: number; rateMmH: number; type: string }>;
  detail?: ForecastDetail;
}

export interface DetailHourly {
  at: string;
  source: 'ultra' | 'vilage';
  tempC?: number;
  pop?: number;
  humidity?: number;
  windMs?: number;
  sky?: string;
  pcp?: string;
  type: string;
  rateMmH?: number;
}

export interface ForecastDetail {
  nowObs: {
    tempC?: number;
    humidity?: number;
    sky?: string;
    lightning?: boolean;
  };
  ultraHourly: DetailHourly[];
  vilageHourly: DetailHourly[];
  vilageAvailable: boolean;
}

export interface RadarFrame {
  time: string;
  file: string;
  imageUrl: string;
  proxyUrl: string;
}

export interface RadarResponse {
  frames: RadarFrame[];
  latestIndex: number;
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
    const fallback =
      res.status === 504
        ? '서버 응답 시간 초과 — 잠시 후 다시 시도해 주세요'
        : `HTTP ${res.status}`;
    throw new Error(err.message ?? fallback);
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

export async function sendTestPush(
  userKey: string,
  kind: 'rain' | 'clear' | 'end_soon' = 'rain',
): Promise<{ resultType?: string; error?: { reason?: string } }> {
  const base = getApiBaseUrl();
  const contextByKind =
    kind === 'clear'
      ? { msg: '지금 집에' }
      : kind === 'end_soon'
        ? { msg: '30분 후 집에' }
        : { msg: '30분 후 집에' };
  const res = await fetch(`${base}/toss/push/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userKey,
      kind,
      context: contextByKind,
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
  patch: Partial<
    Pick<SavedLocation, 'name' | 'lat' | 'lng' | 'address' | 'notifyEnabled' | 'notifyBeforeMin'>
  >,
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

export async function fetchForecast(lat: number, lng: number): Promise<ForecastDetail> {
  const base = getApiBaseUrl();
  const q = new URLSearchParams({ lat: String(lat), lng: String(lng) });
  const res = await fetch(`${base}/forecast?${q}`);
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(err.message ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<ForecastDetail>;
}

export async function fetchRadar(): Promise<RadarResponse> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/radar`);
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { message?: string; hint?: string };
    throw new Error(err.hint ?? err.message ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<RadarResponse>;
}

export function radarImageUrl(proxyPath: string): string {
  return `${getApiBaseUrl()}${proxyPath}`;
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

export function dataSourceLabel(source: LiveRelayReport['spatial']['dataSource']): string {
  switch (source) {
    case 'blended':
      return 'HSR+MAPLE+초단기';
    case 'hsr':
      return 'HSR 500m';
    case 'aws':
      return 'AWS';
    default:
      return '초단기예보';
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

/** 알림 시점 칩에 표시할 강수 가능성(%) */
export function rainChanceAtMinute(report: LiveRelayReport, offsetMin: 30 | 60): number {
  const slot = report.timeline.find((t) => t.offsetMin === offsetMin);
  const precipAt = slot ? slot.type !== 'none' || slot.rateMmH > 0.1 : false;

  if (report.now.precipitating) {
    return Math.min(99, report.confidence);
  }

  if (precipAt && slot) {
    const boost = Math.min(12, Math.round(slot.rateMmH * 2));
    return Math.min(99, report.confidence + boost);
  }

  if (report.arrival.willArrive && report.arrival.inMinutes != null) {
    const mins = report.arrival.inMinutes;
    if (mins <= offsetMin) {
      const ratio = 1 - (mins / (offsetMin + 1)) * 0.35;
      return Math.min(95, Math.round(report.confidence * Math.max(0.45, ratio)));
    }
    return Math.max(8, Math.round(report.confidence * 0.2));
  }

  return Math.max(5, Math.round(report.confidence * 0.12));
}
