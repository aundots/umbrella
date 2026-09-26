/** 레이더 합성장 500m LCC 격자 (기상청 레이더 Open API 가이드 기준) */
const RE = 6371.00877;
const GRID = 0.5;
const SLAT1 = 30.0;
const SLAT2 = 60.0;
const OLON = 126.0;
const OLAT = 38.0;
const XO = 210 / GRID;
const YO = 675 / GRID;

export function latLngToRadarGrid(lat: number, lng: number): { x: number; y: number } {
  const DEGRAD = Math.PI / 180.0;

  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

  const sn =
    Math.log(Math.cos(slat1) / Math.cos(slat2)) /
    Math.log(Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5));
  const sf = (Math.pow(Math.tan(Math.PI * 0.25 + slat1 * 0.5), sn) * Math.cos(slat1)) / sn;
  const ro = (re * sf) / Math.pow(Math.tan(Math.PI * 0.25 + olat * 0.5), sn);

  const ra = (re * sf) / Math.pow(Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5), sn);
  let theta = lng * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;

  const x = Math.floor(ra * Math.sin(theta) + XO + 0.5);
  const y = Math.floor(ro - ra * Math.cos(theta) + YO + 0.5);
  return { x, y };
}

export function parseGridValues(raw: string): number[] {
  return raw
    .trim()
    .split(/[\s,]+/)
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n));
}

export function sampleGridAt(
  values: number[],
  xdim: number,
  ydim: number,
  x0: number,
  y0: number,
  x: number,
  y: number,
): number | null {
  const ix = x - x0;
  const iy = y - y0;
  if (ix < 0 || iy < 0 || ix >= xdim || iy >= ydim) return null;
  const idx = iy * xdim + ix;
  if (idx < 0 || idx >= values.length) return null;
  const v = values[idx];
  if (v <= -900 || v >= 9990) return null;
  return v;
}
