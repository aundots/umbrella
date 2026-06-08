import { Accuracy, useGeolocation } from '@apps-in-toss/framework';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { USER_KEY } from '../config';
import {
  fetchLocations,
  fetchRelay,
  LiveRelayReport,
  registerUser,
  SavedLocation,
} from '../services/api';

const FALLBACK_CURRENT: SavedLocation = {
  id: 'current',
  userKey: USER_KEY,
  name: '현재',
  lat: 37.5665,
  lng: 126.978,
  notifyEnabled: true,
  notifyBeforeMin: 30,
};

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
  const coords = useCurrentCoords();
  const [saved, setSaved] = useState<SavedLocation[]>([]);
  const [activeId, setActiveId] = useState('current');

  const current = useMemo<SavedLocation>(
    () => ({
      ...FALLBACK_CURRENT,
      lat: coords.lat,
      lng: coords.lng,
    }),
    [coords.lat, coords.lng],
  );

  const locations = useMemo(() => [current, ...saved], [current, saved]);

  const reload = useCallback(async () => {
    try {
      await registerUser(USER_KEY, true);
      const list = await fetchLocations(USER_KEY);
      setSaved(list);
    } catch {
      setSaved([]);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const active = locations.find((l) => l.id === activeId) ?? current;

  return { locations, active, activeId, setActiveId, reload, coords };
}

export function useRelay(active: SavedLocation) {
  const [report, setReport] = useState<LiveRelayReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
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
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  return { report, loading, error, reload: load };
}
