import { dedupePlaces, isRoadOrJibunQuery } from './korean.js';
import { searchJusoPlaces } from './juso.js';
import { searchNominatimPlaces } from './nominatim.js';
import type { GeocodePlace } from './types.js';

function jusoConfmKey(): string | undefined {
  const key = process.env.JUSO_CONFM_KEY?.trim();
  return key || undefined;
}

export async function searchPlaces(query: string): Promise<GeocodePlace[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const confmKey = jusoConfmKey();
  const merged: GeocodePlace[] = [];

  if (confmKey && isRoadOrJibunQuery(q)) {
    try {
      merged.push(...(await searchJusoPlaces(q, confmKey)));
    } catch {
      // fall through to Nominatim
    }
  }

  try {
    merged.push(...(await searchNominatimPlaces(q)));
  } catch {
    if (merged.length === 0) throw new Error('place search failed');
  }

  if (confmKey && merged.length < 5 && !isRoadOrJibunQuery(q)) {
    try {
      merged.push(...(await searchJusoPlaces(q, confmKey)));
    } catch {
      // optional supplement
    }
  }

  return dedupePlaces(merged, 20);
}
