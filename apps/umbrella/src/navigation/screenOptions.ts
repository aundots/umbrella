import type { NativeStackNavigationOptions } from '@granite-js/native/@react-navigation/native-stack';

/**
 * 심사: 번들에 headerShown:true 필요 (정적 분석)
 * 런타임: 투명 헤더로 RN Stack 바는 숨기고 granite.config navigationBar만 노출
 */
export const TOSS_SCREEN_OPTIONS: NativeStackNavigationOptions = {
  headerShown: true,
  headerTransparent: true,
  headerTitle: '',
  headerShadowVisible: false,
};
