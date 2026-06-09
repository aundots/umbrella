import { getVilageFcstBaseTime } from './baseTime.js';
import { fetchVilageApi } from './http.js';
import { pcpToMm } from './labels.js';
import { PTY_MAP, PrecipType, VilageHourly } from './types.js';

function parseFcstDate(fcstDate: string, fcstTime: string): Date {
  const y = Number(fcstDate.slice(0, 4));
  const m = Number(fcstDate.slice(4, 6)) - 1;
  const d = Number(fcstDate.slice(6, 8));
  const h = Number(fcstTime.slice(0, 2));
  const min = Number(fcstTime.slice(2, 4) || '0');
  return new Date(y, m, d, h, min);
}

export async function fetchVilageFcst(nx: number, ny: number): Promise<VilageHourly[]> {
  const { baseDate, baseTime } = getVilageFcstBaseTime();
  const items = await fetchVilageApi('getVilageFcst', {
    base_date: baseDate,
    base_time: baseTime,
    nx: String(nx),
    ny: String(ny),
  });

  const byTime = new Map<string, Partial<VilageHourly>>();
  for (const it of items) {
    if (!it.fcstDate || !it.fcstTime) continue;
    const key = `${it.fcstDate}${it.fcstTime}`;
    const slot = byTime.get(key) ?? { at: parseFcstDate(it.fcstDate, it.fcstTime) };
    const val = it.fcstValue ?? '';
    switch (it.category) {
      case 'TMP':
        slot.tempC = Number(val);
        break;
      case 'POP':
        slot.pop = Number(val);
        break;
      case 'PCP':
        slot.pcp = val;
        slot.pcpMm = pcpToMm(val);
        break;
      case 'REH':
        slot.reh = Number(val);
        break;
      case 'WSD':
        slot.wsd = Number(val);
        break;
      case 'SKY':
        slot.sky = val;
        break;
      case 'PTY':
        slot.pty = PTY_MAP[val] ?? 'none';
        break;
    }
    byTime.set(key, slot);
  }

  return [...byTime.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, s]) => ({
      at: s.at!,
      tempC: s.tempC,
      pop: s.pop,
      pcp: s.pcp ?? '강수없음',
      pcpMm: s.pcpMm ?? 0,
      reh: s.reh,
      wsd: s.wsd,
      sky: s.sky,
      pty: s.pty ?? ('none' as PrecipType),
    }));
}
