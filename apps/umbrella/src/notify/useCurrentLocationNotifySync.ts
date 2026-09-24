import { useEffect, useRef } from 'react';
import { useAuth } from '../auth/AuthContext';
import { snapCoord } from '../location/relayKey';
import { syncCurrentLocation } from '../services/api';
import { getNotifyBeforeMin, getNotifyEnabled } from './prefs';

/** 알림 동의 + GPS 변경 시 서버에 현재 위치 동기화 (cron 푸시 대상) */
export function useCurrentLocationNotifySync(
  lat: number,
  lng: number,
  ready: boolean,
  address?: string | null,
): void {
  const { userKey } = useAuth();
  const lastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userKey || !ready) return;

    const snappedLat = snapCoord(lat);
    const snappedLng = snapCoord(lng);
    const syncKey = `${userKey}:${snappedLat}:${snappedLng}`;
    if (lastKeyRef.current === syncKey) return;

    let cancelled = false;

    (async () => {
      const notifyEnabled = await getNotifyEnabled();
      if (!notifyEnabled) {
        await syncCurrentLocation(userKey, {
          lat: snappedLat,
          lng: snappedLng,
          address: address ?? undefined,
          notifyEnabled: false,
          notifyBeforeMin: await getNotifyBeforeMin(),
        }).catch(() => undefined);
        if (!cancelled) lastKeyRef.current = syncKey;
        return;
      }

      await syncCurrentLocation(userKey, {
        lat: snappedLat,
        lng: snappedLng,
        address: address ?? undefined,
        notifyEnabled: true,
        notifyBeforeMin: await getNotifyBeforeMin(),
      });
      if (!cancelled) lastKeyRef.current = syncKey;
    })();

    return () => {
      cancelled = true;
    };
  }, [userKey, lat, lng, ready, address]);
}
