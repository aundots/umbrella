import { candidateRadarDateTimes } from './wthrRadar.js';
import { fetchMapleQpfGrid, isApihubConfigured, rainRateAtGrid } from './apihub.js';

export interface MapleForecastSlot {
  offsetMin: number;
  rateMmH: number;
}

const LEAD_MINUTES = [10, 20, 30, 40, 50, 60];
const MAX_BASE_TIME_ATTEMPTS = 2;

export async function fetchMapleAtLocation(
  lat: number,
  lng: number,
): Promise<{ baseTime: string | null; slots: MapleForecastSlot[] }> {
  if (!isApihubConfigured()) {
    return { baseTime: null, slots: [] };
  }

  for (const baseTime of candidateRadarDateTimes().slice(0, MAX_BASE_TIME_ATTEMPTS)) {
    const leadResults = await Promise.all(
      LEAD_MINUTES.map(async (leadMin) => {
        try {
          const grid = await fetchMapleQpfGrid(baseTime, leadMin);
          if (!grid) return null;
          const rate = rainRateAtGrid(grid, lat, lng);
          return { offsetMin: leadMin, rateMmH: rate ?? 0 };
        } catch {
          return null;
        }
      }),
    );

    const slots = leadResults.filter((slot): slot is MapleForecastSlot => slot != null);
    if (slots.length > 0) {
      return { baseTime, slots };
    }
  }

  return { baseTime: null, slots: [] };
}
