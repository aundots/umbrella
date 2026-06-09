import { loadFullScreenAd, showFullScreenAd } from '@apps-in-toss/framework';

const TEST_AD_GROUP_ID = 'ait-ad-test-interstitial-id';

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
      options: { adGroupId: TEST_AD_GROUP_ID },
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
  const done = () => {
    preloadInterstitial();
    onDone?.();
  };

  if (showFullScreenAd.isSupported && !showFullScreenAd.isSupported()) {
    done();
    return;
  }

  const now = Date.now();
  if (!loaded || now - lastShownAt < COOLDOWN_MS) {
    done();
    return;
  }

  try {
    showFullScreenAd({
      options: { adGroupId: TEST_AD_GROUP_ID },
      onEvent: (event) => {
        if (event.type === 'dismissed' || event.type === 'failedToShow') {
          loaded = false;
          lastShownAt = Date.now();
          done();
        }
      },
      onError: () => {
        loaded = false;
        done();
      },
    });
  } catch {
    done();
  }
}
