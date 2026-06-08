import { useCallback, useEffect, useState } from 'react';
import { USER_KEY } from '../config';
import {
  fetchLocations,
  fetchRelay,
  LiveRelayReport,
  registerUser,
  SavedLocation,
} from '../services/api';

const DEFAULT_CURRENT: SavedLocation = {
  id: 'current',
  userKey: USER_KEY,
  name: '현재',
  lat: 37.5665,
  lng: 126.978,
  notifyEnabled: true,
  notifyBeforeMin: 30,
};

export function useLocations() {
  const [locations, setLocations] = useState<SavedLocation[]>([DEFAULT_CURRENT]);
  const [activeId, setActiveId] = useState('current');

  const reload = useCallback(async () => {
    try {
      await registerUser(USER_KEY, true);
      const saved = await fetchLocations(USER_KEY);
      setLocations([DEFAULT_CURRENT, ...saved]);
    } catch {
      setLocations([DEFAULT_CURRENT]);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const active =
    locations.find((l) => l.id === activeId) ?? DEFAULT_CURRENT;

  return { locations, active, activeId, setActiveId, reload };
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
