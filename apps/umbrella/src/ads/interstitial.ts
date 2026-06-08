import { loadFullScreenAd, showFullScreenAd } from '@apps-in-toss/framework';

const TEST_AD_GROUP_ID = 'ait-ad-test-interstitial-id';

let loaded = false;

export function preloadInterstitial(): void {
  try {
    loadFullScreenAd({
      options: { adGroupId: TEST_AD_GROUP_ID },
      onEvent: (event) => {
        if (event.type === 'loaded') loaded = true;
      },
      onError: () => {},
    });
  } catch {
    // 샌드박스/미지원 환경
  }
}

export function showInterstitial(onDone?: () => void): void {
  try {
    if (!loaded) {
      onDone?.();
      return;
    }
    showFullScreenAd({
      options: { adGroupId: TEST_AD_GROUP_ID },
      onEvent: (event) => {
        if (event.type === 'dismissed' || event.type === 'failedToShow') {
          loaded = false;
          preloadInterstitial();
          onDone?.();
        }
      },
      onError: () => onDone?.(),
    });
  } catch {
    onDone?.();
  }
}
