import { dedupePlaces } from './korean.js';
import { searchNominatimPlaces } from './nominatim.js';
import type { GeocodePlace } from './types.js';

export async function searchPlaces(query: string): Promise<GeocodePlace[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const results = await searchNominatimPlaces(q);
  return dedupePlaces(results, 20);
}
