import { fetchRadarApi } from './http.js';
import { RadarFrame } from './types.js';

const RADAR_IMG_BASE = 'http://www.kma.go.kr/repositary/image/rdr/img/';

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

function parseTimeFromFilename(name: string): string {
  const m = name.match(/(\d{12})\.png$/i);
  if (!m) return '';
  const raw = m[1];
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(8, 10)}:${raw.slice(10, 12)}:00+09:00`;
}

function fileNameFromUrl(url: string): string {
  return url.includes('/') ? url.split('/').pop()! : url;
}

function collectImageUrls(items: Record<string, unknown>[]): string[] {
  const urls: string[] = [];
  for (const it of items) {
    const raw = it['rdr-img-file'] ?? it.img ?? it.rdrImg ?? it.image;
    if (Array.isArray(raw)) {
      urls.push(...raw.filter(Boolean));
    } else if (typeof raw === 'string' && raw) {
      urls.push(raw);
    }
  }
  return urls;
}

export async function fetchRadarFrames(): Promise<RadarFrame[]> {
  const items = await fetchRadarApi('getCmpImg', {
    data: 'CMP_WRC',
    time: todayKst(),
  });

  const frames: RadarFrame[] = collectImageUrls(items)
    .map((url) => {
      const file = fileNameFromUrl(url);
      if (!file) return null;
      return {
        time: parseTimeFromFilename(file),
        file,
        imageUrl: toImageUrl(url),
      };
    })
    .filter((f): f is RadarFrame => f != null);

  return frames.sort((a, b) => a.time.localeCompare(b.time));
}

export function proxyImagePath(file: string): string {
  const name = file.includes('/') ? file.split('/').pop()! : file;
  return `/radar/image?file=${encodeURIComponent(name)}`;
}
