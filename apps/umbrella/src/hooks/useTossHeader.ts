import { useNavigation } from '@granite-js/react-native';
import { useLayoutEffect } from 'react';
import { TOSS_SCREEN_OPTIONS } from '../navigation/screenOptions';

/** TDS PageNavbar 등이 headerShown:false를 덮어쓰지 못하도록 매 화면에서 재설정 */
export function useTossHeader() {
  const navigation = useNavigation();

  useLayoutEffect(() => {
    navigation.setOptions(TOSS_SCREEN_OPTIONS);
  }, [navigation]);
}
