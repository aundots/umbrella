import { getUltraFcstBaseTime, getUltraNcstBaseTime } from './baseTime.js';
import { latLngToGrid } from './grid.js';
import { FcstSlot, KmaItem, PTY_MAP, PrecipType } from './types.js';

const BASE = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0';

function getServiceKey(): string {
  const key = process.env.DATA_GO_KR_SERVICE_KEY;
  if (!key) throw new Error('DATA_GO_KR_SERVICE_KEY is not set');
  return decodeURIComponent(key);
}

async function fetchKma(path: string, params: Record<string, string>): Promise<KmaItem[]> {
  const url = new URL(`${BASE}/${path}`);
  url.searchParams.set('serviceKey', getServiceKey());
  url.searchParams.set('pageNo', '1');
  url.searchParams.set('numOfRows', '1000');
  url.searchParams.set('dataType', 'JSON');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString());
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

export async function fetchUltraNcst(nx: number, ny: number): Promise<Map<string, string>> {
  const { baseDate, baseTime } = getUltraNcstBaseTime();
  const items = await fetchKma('getUltraSrtNcst', {
    base_date: baseDate,
    base_time: baseTime,
    nx: String(nx),
    ny: String(ny),
  });
  const map = new Map<string, string>();
  for (const it of items) {
    map.set(it.category, it.obsrValue ?? '');
  }
  return map;
}

export async function fetchUltraFcst(nx: number, ny: number): Promise<FcstSlot[]> {
  const { baseDate, baseTime } = getUltraFcstBaseTime();
  const items = await fetchKma('getUltraSrtFcst', {
    base_date: baseDate,
    base_time: baseTime,
    nx: String(nx),
    ny: String(ny),
  });

  const byTime = new Map<string, Partial<FcstSlot>>();
  for (const it of items) {
    const key = `${it.fcstDate}${it.fcstTime}`;
    const slot = byTime.get(key) ?? { at: parseFcstDate(key) };
    const val = it.fcstValue ?? '0';
    switch (it.category) {
      case 'PTY':
        slot.pty = PTY_MAP[val] ?? 'none';
        break;
      case 'RN1':
        slot.rn1 = parseRn1(val);
        break;
      case 'UUU':
        slot.uuu = Number(val);
        break;
      case 'VVV':
        slot.vvv = Number(val);
        break;
    }
    byTime.set(key, slot);
  }

  return [...byTime.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, s]) => ({
      at: s.at!,
      pty: s.pty ?? 'none',
      rn1: s.rn1 ?? 0,
      uuu: s.uuu,
      vvv: s.vvv,
    }));
}

function parseFcstDate(key: string): Date {
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(4, 6)) - 1;
  const d = Number(key.slice(6, 8));
  const h = Number(key.slice(8, 10));
  const min = Number(key.slice(10, 12));
  return new Date(y, m, d, h, min);
}

function parseRn1(val: string): number {
  if (!val || val === '강수없음') return 0;
  const n = parseFloat(val.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export async function fetchLocationWeather(lat: number, lng: number) {
  const { nx, ny } = latLngToGrid(lat, lng);
  const [ncst, fcst] = await Promise.all([
    fetchUltraNcst(nx, ny),
    fetchUltraFcst(nx, ny),
  ]);
  return { nx, ny, ncst, fcst };
}

export function ncstPrecipType(ncst: Map<string, string>): PrecipType {
  return PTY_MAP[ncst.get('PTY') ?? '0'] ?? 'none';
}

export function ncstRn1(ncst: Map<string, string>): number {
  return parseRn1(ncst.get('RN1') ?? '0');
}

export function windFromComponents(uuu?: number, vvv?: number): number | null {
  if (uuu == null || vvv == null) return null;
  const deg = (Math.atan2(uuu, vvv) * 180) / Math.PI;
  return (deg + 360) % 360;
}
