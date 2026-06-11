import { getUltraFcstBaseTime, getUltraNcstBaseTime } from './baseTime.js';
import { fcstKeyToDate, kstStringToDate, nowKstParts } from './kst.js';
import { getCached, setCache } from './cache.js';
import { fetchVilageApi } from './http.js';
import { latLngToGrid } from './grid.js';
import { FcstSlot, KmaItem, PTY_MAP, PrecipType } from './types.js';

async function fetchKma(path: string, params: Record<string, string>): Promise<KmaItem[]> {
  return fetchVilageApi(path, params);
}

function stepBaseTimeBack(baseDate: string, baseTime: string): { baseDate: string; baseTime: string } {
  const h = Number(baseTime.slice(0, 2));
  const m = Number(baseTime.slice(2, 4));
  const totalMin = h * 60 + m - 30;
  if (totalMin >= 0) {
    return {
      baseDate,
      baseTime: `${String(Math.floor(totalMin / 60)).padStart(2, '0')}${String(totalMin % 60).padStart(2, '0')}`,
    };
  }
  const d = new Date(kstStringToDate(baseDate, baseTime).getTime() - 30 * 60_000);
  const parts = nowKstParts(d);
  const minute = parts.minute < 30 ? 0 : 30;
  return {
    baseDate: `${parts.year}${String(parts.month).padStart(2, '0')}${String(parts.day).padStart(2, '0')}`,
    baseTime: `${String(parts.hour).padStart(2, '0')}${String(minute).padStart(2, '0')}`,
  };
}

async function fetchKmaWithFallback(
  path: string,
  params: Record<string, string>,
): Promise<KmaItem[]> {
  try {
    return await fetchKma(path, params);
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (!msg.includes('NO_DATA')) throw e;
    const prev = stepBaseTimeBack(params.base_date, params.base_time);
    return fetchKma(path, { ...params, base_date: prev.baseDate, base_time: prev.baseTime });
  }
}

export async function fetchUltraNcst(nx: number, ny: number): Promise<Map<string, string>> {
  const { baseDate, baseTime } = getUltraNcstBaseTime();
  const cacheKey = `ultra:ncst:${nx}:${ny}:${baseDate}${baseTime}`;
  const cached = getCached<Map<string, string>>(cacheKey);
  if (cached) return cached;

  const items = await fetchKmaWithFallback('getUltraSrtNcst', {
    base_date: baseDate,
    base_time: baseTime,
    nx: String(nx),
    ny: String(ny),
  });
  const map = new Map<string, string>();
  for (const it of items) {
    map.set(it.category, it.obsrValue ?? '');
  }
  setCache(cacheKey, map);
  return map;
}

export async function fetchUltraFcst(nx: number, ny: number): Promise<FcstSlot[]> {
  const { baseDate, baseTime } = getUltraFcstBaseTime();
  const cacheKey = `ultra:fcst:${nx}:${ny}:${baseDate}${baseTime}`;
  const cached = getCached<FcstSlot[]>(cacheKey);
  if (cached) return cached;

  const items = await fetchKmaWithFallback('getUltraSrtFcst', {
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
      case 'T1H':
        slot.t1h = Number(val);
        break;
      case 'REH':
        slot.reh = Number(val);
        break;
      case 'SKY':
        slot.sky = val;
        break;
      case 'LGT':
        slot.lgt = val !== '0' && val !== '';
        break;
    }
    byTime.set(key, slot);
  }

  const slots = [...byTime.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, s]) => ({
      at: s.at!,
      pty: s.pty ?? 'none',
      rn1: s.rn1 ?? 0,
      uuu: s.uuu,
      vvv: s.vvv,
      t1h: s.t1h,
      reh: s.reh,
      sky: s.sky,
      lgt: s.lgt,
    }));
  setCache(cacheKey, slots);
  return slots;
}

function parseFcstDate(key: string): Date {
  return fcstKeyToDate(key);
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
