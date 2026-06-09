import { fetchRadarApi } from './http.js';
import { RadarFrame } from './types.js';

const RADAR_IMG_BASE = 'https://www.weather.go.kr/w/repositary/image/rdr/img/CMP_WRC/';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function todayKst(): string {
  const d = new Date();
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}${pad(kst.getUTCMonth() + 1)}${pad(kst.getUTCDate())}`;
}

function toImageUrl(file: string): string {
  if (file.startsWith('http')) return file;
  const name = file.includes('/') ? file.split('/').pop()! : file;
  return `${RADAR_IMG_BASE}${name}`;
}

function parseFrameTime(raw: string | undefined): string {
  if (!raw) return '';
  if (raw.length >= 12) {
    const y = raw.slice(0, 4);
    const m = raw.slice(4, 6);
    const d = raw.slice(6, 8);
    const h = raw.slice(8, 10);
    const min = raw.slice(10, 12);
    return `${y}-${m}-${d}T${h}:${min}:00+09:00`;
  }
  return raw;
}

export async function fetchRadarFrames(): Promise<RadarFrame[]> {
  const items = await fetchRadarApi('getCmpImg', {
    data: 'CMP_WRC',
    time: todayKst(),
  });

  const frames: RadarFrame[] = items
    .map((it) => {
      const file = it.img ?? it.rdrImg ?? it.image ?? '';
      const tm = it.tm ?? it.tmUtc ?? it.time ?? '';
      if (!file) return null;
      return {
        time: parseFrameTime(tm),
        file,
        imageUrl: toImageUrl(file),
      };
    })
    .filter((f): f is RadarFrame => f != null);

  return frames.sort((a, b) => a.time.localeCompare(b.time));
}

export function proxyImagePath(file: string): string {
  const name = file.includes('/') ? file.split('/').pop()! : file;
  return `/radar/image?file=${encodeURIComponent(name)}`;
}
