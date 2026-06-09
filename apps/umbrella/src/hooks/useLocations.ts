import { Accuracy, useGeolocation } from '@apps-in-toss/framework';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import {
  fetchLocations,
  fetchRelay,
  LiveRelayReport,
  registerUser,
  SavedLocation,
} from '../services/api';
import { GeocodePlace, reverseGeocode } from '../services/geocode';

const FALLBACK_CURRENT: SavedLocation = {
  id: 'current',
  userKey: 'current',
  name: '현재',
  lat: 37.5665,
  lng: 126.978,
  notifyEnabled: true,
  notifyBeforeMin: 30,
};

function sessionId(lat: number, lng: number): string {
  return `session-${lat.toFixed(4)}-${lng.toFixed(4)}`;
}

function placeToSessionLocation(place: GeocodePlace, userKey: string): SavedLocation {
  return {
    id: sessionId(place.lat, place.lng),
    userKey,
    name: place.name,
    address: place.address,
    lat: place.lat,
    lng: place.lng,
    notifyEnabled: false,
    notifyBeforeMin: 30,
  };
}

export function useCurrentCoords() {
  const geo = useGeolocation({
    accuracy: Accuracy.Balanced,
    timeInterval: 60_000,
    distanceInterval: 200,
  });

  return useMemo(
    () => ({
      lat: geo?.coords.latitude ?? FALLBACK_CURRENT.lat,
      lng: geo?.coords.longitude ?? FALLBACK_CURRENT.lng,
      ready: geo != null,
    }),
    [geo?.coords.latitude, geo?.coords.longitude, geo],
  );
}

export function useLocations() {
  const { userKey } = useAuth();
  const coords = useCurrentCoords();
  const [saved, setSaved] = useState<SavedLocation[]>([]);
  const [sessionPlaces, setSessionPlaces] = useState<SavedLocation[]>([]);
  const [activeId, setActiveId] = useState('current');
  const [currentAddress, setCurrentAddress] = useState<string | null>(null);

  const current = useMemo<SavedLocation>(
    () => ({
      ...FALLBACK_CURRENT,
      lat: coords.lat,
      lng: coords.lng,
      address: currentAddress ?? undefined,
    }),
    [coords.lat, coords.lng, currentAddress],
  );

  const locations = useMemo(
    () => [current, ...saved, ...sessionPlaces],
    [current, saved, sessionPlaces],
  );

  const reload = useCallback(async () => {
    if (!userKey) return;
    try {
      await registerUser(userKey, true);
      const list = await fetchLocations(userKey);
      setSaved(list);
    } catch {
      setSaved([]);
    }
  }, [userKey]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    let cancelled = false;
    reverseGeocode(coords.lat, coords.lng)
      .then((place) => {
        if (!cancelled) setCurrentAddress(place.address);
      })
      .catch(() => {
        if (!cancelled) setCurrentAddress(null);
      });
    return () => {
      cancelled = true;
    };
  }, [coords.lat, coords.lng]);

  const addSearchedPlace = useCallback((place: GeocodePlace) => {
    if (!userKey) return;
    const loc = placeToSessionLocation(place, userKey);
    setSessionPlaces((prev) => {
      const filtered = prev.filter((item) => item.id !== loc.id);
      return [loc, ...filtered].slice(0, 8);
    });
    setActiveId(loc.id);
  }, [userKey]);

  const active = locations.find((l) => l.id === activeId) ?? current;

  const activeAddress =
    active.id === 'current'
      ? currentAddress ?? '위치 확인 중…'
      : active.address ?? `${active.lat.toFixed(4)}, ${active.lng.toFixed(4)}`;

  return {
    locations,
    active,
    activeId,
    activeAddress,
    currentAddress,
    setActiveId,
    addSearchedPlace,
    reload,
    coords,
  };
}

export function useRelay(active: SavedLocation) {
  const [report, setReport] = useState<LiveRelayReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (withSpinner = false) => {
    if (withSpinner) setLoading(true);
    setError(null);
    try {
      const data = await fetchRelay(active.lat, active.lng, active.name);
      setReport(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오기 실패');
    } finally {
      setLoading(false);
    }
  }, [active.lat, active.lng, active.name]);

  useEffect(() => {
    load(false);
    const t = setInterval(() => load(false), 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  return { report, loading, error, reload: () => load(true) };
}
