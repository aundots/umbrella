import { getCached, setCache } from './cache.js';
import { fetchWithTimeout } from './fetchUtil.js';
import { getServiceKey } from './http.js';
import { latLngToRadarGrid, parseGridValues, sampleGridAt } from './radarGrid.js';

const BASE = 'https://apis.data.go.kr/1360000/WthrRadarInfoService';

export interface RadarGridField {
  dateTime: string;
  xdim: number;
  ydim: number;
  x0: number;
  y0: number;
  gridKm: number;
  unit: string;
  values: number[];
}

function pad(n: number, len = 2): string {
  return String(n).padStart(len, '0');
}

/** 레이더 자료는 현재시각 기준 최소 ~20분 전 관측분 */
export function candidateRadarDateTimes(now = new Date(), attempts = 6): string[] {
  const out: string[] = [];
  const start = new Date(now.getTime() - 20 * 60_000);
  const d = new Date(start);
  d.setMinutes(Math.floor(d.getMinutes() / 5) * 5, 0, 0);

  for (let i = 0; i < attempts; i++) {
    const kst = new Date(d.getTime() - i * 5 * 60_000);
    out.push(
      `${kst.getFullYear()}${pad(kst.getMonth() + 1)}${pad(kst.getDate())}${pad(kst.getHours())}${pad(kst.getMinutes())}`,
    );
  }
  return out;
}

async function fetchRadarGrid(
  path: string,
  dateTime: string,
  extra: Record<string, string> = {},
): Promise<RadarGridField | null> {
  const url = new URL(`${BASE}/${path}`);
  url.searchParams.set('serviceKey', getServiceKey());
  url.searchParams.set('pageNo', '1');
  url.searchParams.set('numOfRows', '1');
  url.searchParams.set('dataType', 'JSON');
  url.searchParams.set('dateTime', dateTime);
  for (const [k, v] of Object.entries(extra)) {
    url.searchParams.set(k, v);
  }

  const res = await fetchWithTimeout(url, undefined, 6_000);
  if (!res.ok) throw new Error(`WthrRadar HTTP ${res.status}`);
  const json = (await res.json()) as {
    response?: {
      header?: { resultCode: string; resultMsg: string };
      body?: { items?: { item?: Record<string, string> | Record<string, string>[] } };
    };
  };

  const code = json.response?.header?.resultCode;
  if (code !== '00') {
    throw new Error(`WthrRadar error: ${json.response?.header?.resultMsg ?? code}`);
  }

  const item = json.response?.body?.items?.item;
  const row = Array.isArray(item) ? item[0] : item;
  if (!row?.value) return null;

  return {
    dateTime: row.dateTime ?? dateTime,
    xdim: Number(row.xdim),
    ydim: Number(row.ydim),
    x0: Number(row.x0),
    y0: Number(row.y0),
    gridKm: Number(row.gridKm ?? 0.5),
    unit: row.unit ?? 'mm/h',
    values: parseGridValues(row.value),
  };
}

async function fetchWithFallback(
  path: string,
  extra: Record<string, string>,
  attempts = 3,
): Promise<RadarGridField | null> {
  const tries = await Promise.all(
    candidateRadarDateTimes(undefined, attempts).map(async (dt) => {
      try {
        return await fetchRadarGrid(path, dt, extra);
      } catch {
        return null;
      }
    }),
  );

  return tries.find((grid) => grid != null && grid.values.length > 0) ?? null;
}

export async function fetchHsrRainGrid(): Promise<RadarGridField | null> {
  const cacheKey = 'hsr:comp-cappi';
  const cached = getCached<RadarGridField>(cacheKey);
  if (cached) return cached;

  const grid = await fetchWithFallback('getCompCappiQcdAll', {
    compType: 'HSP',
    dataTypeCd: 'RN',
  });
  if (grid) setCache(cacheKey, grid);
  return grid;
}

export function rainRateAt(
  grid: RadarGridField,
  lat: number,
  lng: number,
): number | null {
  const { x, y } = latLngToRadarGrid(lat, lng);
  const v = sampleGridAt(grid.values, grid.xdim, grid.ydim, grid.x0, grid.y0, x, y);
  if (v == null || v < 0) return null;
  return Math.round(v * 10) / 10;
}
