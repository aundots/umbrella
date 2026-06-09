import { latLngToRadarGrid, parseGridValues, sampleGridAt } from './radarGrid.js';
import type { RadarGridField } from './wthrRadar.js';

const TYPO2 = 'https://apihub.kma.go.kr/api/typ02/openApi/WthrRadarInfoService';

export function getApihubKey(): string | null {
  const key = process.env.KMA_APIHUB_AUTH_KEY?.trim();
  return key || null;
}

export function isApihubConfigured(): boolean {
  return getApihubKey() != null;
}

async function fetchApihubGrid(
  path: string,
  dateTime: string,
  params: Record<string, string>,
): Promise<RadarGridField | null> {
  const authKey = getApihubKey();
  if (!authKey) return null;

  const url = new URL(`${TYPO2}/${path}`);
  url.searchParams.set('authKey', authKey);
  url.searchParams.set('pageNo', '1');
  url.searchParams.set('numOfRows', '1');
  url.searchParams.set('dataType', 'JSON');
  url.searchParams.set('dateTime', dateTime);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`APIHub HTTP ${res.status}`);
  const json = (await res.json()) as {
    response?: {
      header?: { resultCode: string; resultMsg: string };
      body?: { items?: { item?: Record<string, string> | Record<string, string>[] } };
    };
    result?: { status: number; message: string };
  };

  if (json.result?.status && json.result.status !== 200) {
    throw new Error(`APIHub error: ${json.result.message}`);
  }

  const code = json.response?.header?.resultCode;
  if (code && code !== '00') {
    throw new Error(`APIHub error: ${json.response?.header?.resultMsg ?? code}`);
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

export async function fetchMapleQpfGrid(
  dateTime: string,
  leadMin: number,
): Promise<RadarGridField | null> {
  const paths = ['getCompQpfCappiQcdAll', 'getCompCappiQpfAll', 'getQpfCappiQcdAll'];
  const paramSets: Record<string, string>[] = [
    { compType: 'HSP', dataTypeCd: 'RN', ef: String(leadMin) },
    { compType: 'HSP', dataTypeCd: 'RN', fcstTime: String(leadMin) },
    { compType: 'HSP', dataTypeCd: 'RN', lead: String(leadMin) },
  ];

  for (const path of paths) {
    for (const params of paramSets) {
      try {
        const grid = await fetchApihubGrid(path, dateTime, params);
        if (grid?.values.length) return grid;
      } catch {
        continue;
      }
    }
  }
  return null;
}

export function rainRateAtGrid(
  grid: RadarGridField,
  lat: number,
  lng: number,
): number | null {
  const { x, y } = latLngToRadarGrid(lat, lng);
  const v = sampleGridAt(grid.values, grid.xdim, grid.ydim, grid.x0, grid.y0, x, y);
  if (v == null || v < 0) return null;
  return Math.round(v * 10) / 10;
}
