import { SavedLocation } from '../services/api';

/** ~100m — same gu/dong shares one relay cache slot */
export function snapCoord(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function relayKey(lat: number, lng: number): string {
  return `${snapCoord(lat)}:${snapCoord(lng)}`;
}

export function relayKeyForLocation(loc: Pick<SavedLocation, 'lat' | 'lng'>): string {
  return relayKey(loc.lat, loc.lng);
}

export function coordsForRelay(loc: Pick<SavedLocation, 'lat' | 'lng'>): {
  lat: number;
  lng: number;
  key: string;
} {
  const lat = snapCoord(loc.lat);
  const lng = snapCoord(loc.lng);
  return { lat, lng, key: relayKey(lat, lng) };
}
