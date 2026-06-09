import { appLogin, Storage } from '@apps-in-toss/framework';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { API_BASE_URL } from '../config';

const STORAGE_KEY = 'umbrella-user-key';

interface AuthContextValue {
  userKey: string | null;
  loading: boolean;
  error: string | null;
  login: () => Promise<string | null>;
  clearSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function createSession(authorizationCode: string, referrer: string): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/toss/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ authorizationCode, referrer }),
  });

  const json = (await res.json()) as { userKey?: string; error?: { reason?: string }; message?: string };
  if (!res.ok || !json.userKey) {
    throw new Error(json.error?.reason ?? json.message ?? `로그인 실패 (${res.status})`);
  }

  return json.userKey;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [userKey, setUserKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const persistUserKey = useCallback(async (key: string | null) => {
    if (key) {
      await Storage.setItem(STORAGE_KEY, key);
    } else {
      await Storage.removeItem(STORAGE_KEY);
    }
    setUserKey(key);
  }, []);

  const login = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { authorizationCode, referrer } = await appLogin();
      const key = await createSession(authorizationCode, referrer);
      await persistUserKey(key);
      return key;
    } catch (e) {
      const message = e instanceof Error ? e.message : '토스 로그인에 실패했습니다';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [persistUserKey]);

  const clearSession = useCallback(async () => {
    await persistUserKey(null);
    setError(null);
  }, [persistUserKey]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const stored = await Storage.getItem(STORAGE_KEY);
        if (cancelled) return;

        if (stored) {
          setUserKey(stored);
          setLoading(false);
          return;
        }

        await login();
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [login]);

  const value = useMemo(
    () => ({ userKey, loading, error, login, clearSession }),
    [userKey, loading, error, login, clearSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
