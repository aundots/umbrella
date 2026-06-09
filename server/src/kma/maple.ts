import { candidateRadarDateTimes } from './wthrRadar.js';
import { fetchMapleQpfGrid, isApihubConfigured, rainRateAtGrid } from './apihub.js';

export interface MapleForecastSlot {
  offsetMin: number;
  rateMmH: number;
}

const LEAD_MINUTES = [10, 20, 30, 40, 50, 60];

export async function fetchMapleAtLocation(
  lat: number,
  lng: number,
): Promise<{ baseTime: string | null; slots: MapleForecastSlot[] }> {
  if (!isApihubConfigured()) {
    return { baseTime: null, slots: [] };
  }

  for (const baseTime of candidateRadarDateTimes()) {
    const slots: MapleForecastSlot[] = [];

    for (const leadMin of LEAD_MINUTES) {
      try {
        const grid = await fetchMapleQpfGrid(baseTime, leadMin);
        if (!grid) continue;
        const rate = rainRateAtGrid(grid, lat, lng);
        if (rate != null && rate > 0) {
          slots.push({ offsetMin: leadMin, rateMmH: rate });
        } else if (rate === 0) {
          slots.push({ offsetMin: leadMin, rateMmH: 0 });
        }
      } catch {
        continue;
      }
    }

    if (slots.length > 0) {
      return { baseTime, slots };
    }
  }

  return { baseTime: null, slots: [] };
}
