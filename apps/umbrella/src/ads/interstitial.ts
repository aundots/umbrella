/** Ads disabled for initial release testing. */
export function preloadInterstitial(): void {}

export function showInterstitial(onDone?: () => void): void {
  onDone?.();
}
