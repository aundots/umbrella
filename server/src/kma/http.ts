import { fetchWithTimeout } from './fetchUtil.js';
import { KmaItem } from './types.js';

const VILAGE_BASE = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0';
const RADAR_BASE = 'https://apis.data.go.kr/1360000/RadarImgInfoService';

export function getServiceKey(): string {
  const key = process.env.DATA_GO_KR_SERVICE_KEY;
  if (!key) throw new Error('DATA_GO_KR_SERVICE_KEY is not set');
  return decodeURIComponent(key);
}

async function fetchKmaJson(
  baseUrl: string,
  path: string,
  params: Record<string, string>,
): Promise<KmaItem[]> {
  const url = new URL(`${baseUrl}/${path}`);
  url.searchParams.set('serviceKey', getServiceKey());
  url.searchParams.set('pageNo', '1');
  url.searchParams.set('numOfRows', '1000');
  url.searchParams.set('dataType', 'JSON');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetchWithTimeout(url, undefined, 8_000);
  if (!res.ok) throw new Error(`KMA HTTP ${res.status}`);
  const json = (await res.json()) as {
    response?: {
      header?: { resultCode: string; resultMsg: string };
      body?: { items?: { item?: KmaItem | KmaItem[] } };
    };
  };

  const code = json.response?.header?.resultCode;
  if (code !== '00') {
    throw new Error(`KMA API error: ${json.response?.header?.resultMsg ?? code}`);
  }

  const item = json.response?.body?.items?.item;
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}

export async function fetchVilageApi(
  path: string,
  params: Record<string, string>,
): Promise<KmaItem[]> {
  return fetchKmaJson(VILAGE_BASE, path, params);
}

export async function fetchRadarApi(
  path: string,
  params: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const url = new URL(`${RADAR_BASE}/${path}`);
  url.searchParams.set('serviceKey', getServiceKey());
  url.searchParams.set('pageNo', '1');
  url.searchParams.set('numOfRows', '30');
  url.searchParams.set('dataType', 'JSON');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetchWithTimeout(url, undefined, 8_000);
  if (!res.ok) throw new Error(`KMA radar HTTP ${res.status}`);
  const json = (await res.json()) as {
    response?: {
      header?: { resultCode: string; resultMsg: string };
      body?: { items?: { item?: Record<string, unknown> | Record<string, unknown>[] } };
    };
  };

  const code = json.response?.header?.resultCode;
  if (code !== '00') {
    throw new Error(`KMA radar error: ${json.response?.header?.resultMsg ?? code}`);
  }

  const item = json.response?.body?.items?.item;
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}
