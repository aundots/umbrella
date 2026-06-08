/** 기상청 동네예보 LCC DFS 격자 변환 (5km) */
const RE = 6371.00877;
const GRID = 5.0;
const SLAT1 = 30.0;
const SLAT2 = 60.0;
const OLON = 126.0;
const OLAT = 38.0;
const XO = 43;
const YO = 136;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDegrees(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function latLngToGrid(lat: number, lng: number): { nx: number; ny: number } {
  const DEGRAD = Math.PI / 180.0;

  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

  let sn =
    Math.tan(Math.PI * 0.25 + slat2 * 0.5) /
    Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);

  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = lng * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;

  const x = Math.floor(ra * Math.sin(theta) + XO + 0.5);
  const y = Math.floor(ro - ra * Math.cos(theta) + YO + 0.5);

  return { nx: x, ny: y };
}

/** HSR 500m 격자용 근사 셀 ID (LCC 기준) */
export function latLngToHsrCell(lat: number, lng: number): string {
  const { nx, ny } = latLngToGrid(lat, lng);
  const subX = Math.floor(((lng - Math.floor(lng * 10) / 10) * 100) % 10);
  const subY = Math.floor(((lat - Math.floor(lat * 10) / 10) * 100) % 10);
  return `${nx}_${ny}_${subX}${subY}`;
}

export function gridToLatLng(nx: number, ny: number): { lat: number; lng: number } {
  const DEGRAD = Math.PI / 180.0;
  const RADDEG = 180.0 / Math.PI;

  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

  let sn =
    Math.tan(Math.PI * 0.25 + slat2 * 0.5) /
    Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);

  const x = nx - XO;
  const y = ro - (ny - YO);
  const ra = Math.sqrt(x * x + y * y);
  if (sn < 0) {
    // noop for lint
  }
  let alat = Math.pow((re * sf) / ra, 1.0 / sn);
  alat = 2.0 * Math.atan(alat) - Math.PI * 0.5;

  let theta = 0;
  if (Math.abs(x) <= 0.0) {
    theta = 0.0;
  } else if (Math.abs(y) <= 0.0) {
    theta = Math.PI * 0.5;
    if (x < 0.0) theta = -theta;
  } else {
    theta = Math.atan2(x, y);
  }
  const alon = theta / sn + olon;

  return { lat: alat * RADDEG, lng: alon * RADDEG };
}
