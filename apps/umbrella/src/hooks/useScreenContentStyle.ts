import { useMemo } from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING } from '../theme';

/** headerTransparent 시 Toss SDK navigationBar 아래로 콘텐츠가 올라가는 만큼 보정 */
const TOSS_NAV_BAR_HEIGHT = 56;

export function useScreenContentStyle(extra?: ViewStyle) {
  const insets = useSafeAreaInsets();

  return useMemo(
    () =>
      StyleSheet.flatten([
        {
          paddingHorizontal: SPACING.screenH,
          paddingTop: insets.top + TOSS_NAV_BAR_HEIGHT + SPACING.screenV,
          paddingBottom: 48,
        },
        extra,
      ]),
    [extra, insets.top],
  );
}

export function useScreenTopInset() {
  const insets = useSafeAreaInsets();
  return insets.top + TOSS_NAV_BAR_HEIGHT;
}

export function useAuthGateStyle() {
  const topInset = useScreenTopInset();
  return useMemo(
    () => ({
      flex: 1 as const,
      backgroundColor: COLORS.bg,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      paddingHorizontal: SPACING.screenH,
      paddingTop: topInset,
      paddingBottom: SPACING.screenV,
    }),
    [topInset],
  );
}
