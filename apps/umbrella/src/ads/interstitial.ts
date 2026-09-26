import { loadFullScreenAd, showFullScreenAd } from '@apps-in-toss/framework';
import { INTERSTITIAL_AD_GROUP_ID } from '../config';

let loaded = false;
let loading = false;
let lastShownAt = 0;
const COOLDOWN_MS = 90_000;

export function preloadInterstitial(): void {
  if (loadFullScreenAd.isSupported && !loadFullScreenAd.isSupported()) return;
  if (loaded || loading) return;
  loading = true;
  try {
    loadFullScreenAd({
      options: { adGroupId: INTERSTITIAL_AD_GROUP_ID },
      onEvent: (event) => {
        if (event.type === 'loaded') {
          loaded = true;
          loading = false;
        }
      },
      onError: () => {
        loading = false;
      },
    });
  } catch {
    loading = false;
  }
}

export function showInterstitial(onDone?: () => void): void {
  let settled = false;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const finish = () => {
    if (settled) return;
    settled = true;
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
    preloadInterstitial();
    onDone?.();
  };

  if (showFullScreenAd.isSupported && !showFullScreenAd.isSupported()) {
    finish();
    return;
  }

  const now = Date.now();
  if (!loaded || now - lastShownAt < COOLDOWN_MS) {
    finish();
    return;
  }

  timeout = setTimeout(() => {
    loaded = false;
    finish();
  }, 8000);

  try {
    showFullScreenAd({
      options: { adGroupId: INTERSTITIAL_AD_GROUP_ID },
      onEvent: (event) => {
        if (event.type === 'dismissed' || event.type === 'failedToShow') {
          loaded = false;
          lastShownAt = Date.now();
          finish();
        }
      },
      onError: () => {
        loaded = false;
        finish();
      },
    });
  } catch {
    finish();
  }
}
