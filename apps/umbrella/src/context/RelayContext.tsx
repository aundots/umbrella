import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { fetchRelay, LiveRelayReport } from '../services/api';
import { coordsForRelay } from '../location/relayKey';
import { useLocations } from './LocationContext';

const CACHE_TTL_MS = 90_000;
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

interface CacheEntry {
  report: LiveRelayReport;
  fetchedAt: number;
}

interface RelayContextValue {
  report: LiveRelayReport | null;
  loading: boolean;
  error: string | null;
  relayKey: string;
  reload: () => Promise<void>;
}

const RelayContext = createContext<RelayContextValue | null>(null);

export function RelayProvider({ children }: { children: React.ReactNode }) {
  const { active } = useLocations();
  const { lat, lng, key } = coordsForRelay(active);

  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());
  const [report, setReport] = useState<LiveRelayReport | null>(null);
  const [reportKey, setReportKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const readCache = useCallback((cacheKey: string): LiveRelayReport | null => {
    const hit = cacheRef.current.get(cacheKey);
    if (!hit || Date.now() - hit.fetchedAt > CACHE_TTL_MS) return null;
    return hit.report;
  }, []);

  const displayReport =
    reportKey === key ? report : readCache(key);

  useEffect(() => {
    let cancelled = false;
    const cacheKey = key;
    const cached = readCache(cacheKey);

    if (cached) {
      setReport(cached);
      setReportKey(cacheKey);
      setLoading(false);
      setError(null);
    } else {
      setReport(null);
      setReportKey('');
      setLoading(true);
      setError(null);
    }

    fetchRelay(lat, lng, active.name)
      .then((data) => {
        if (cancelled) return;
        cacheRef.current.set(cacheKey, { report: data, fetchedAt: Date.now() });
        setReport(data);
        setReportKey(cacheKey);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        if (!cached) {
          setError(e instanceof Error ? e.message : '불러오기 실패');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const interval = setInterval(() => {
      fetchRelay(lat, lng, active.name)
        .then((data) => {
          if (cancelled) return;
          cacheRef.current.set(cacheKey, { report: data, fetchedAt: Date.now() });
          setReport(data);
          setReportKey(cacheKey);
        })
        .catch(() => {});
    }, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [key, lat, lng, active.name, readCache]);

  const fetchAndStore = useCallback(
    async (cacheKey: string, silent: boolean) => {
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const data = await fetchRelay(lat, lng, active.name);
        cacheRef.current.set(cacheKey, { report: data, fetchedAt: Date.now() });
        setReport(data);
        setReportKey(cacheKey);
        setError(null);
      } catch (e) {
        if (!silent) {
          setError(e instanceof Error ? e.message : '불러오기 실패');
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [lat, lng, active.name],
  );

  const reload = useCallback(async () => {
    await fetchAndStore(key, false);
  }, [fetchAndStore, key]);

  const value: RelayContextValue = {
    report: displayReport,
    loading: loading && !displayReport,
    error,
    relayKey: key,
    reload,
  };

  return React.createElement(RelayContext.Provider, { value }, children);
}

export function useRelay(): RelayContextValue {
  const ctx = useContext(RelayContext);
  if (!ctx) throw new Error('RelayProvider is required');
  return ctx;
}
