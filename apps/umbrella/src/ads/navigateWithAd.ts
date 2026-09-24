import { showInterstitial } from './interstitial';

type NavigateFn = (route: string) => void;

export function navigateWithAd(navigate: NavigateFn, route: string): void {
  showInterstitial(() => navigate(route));
}
