import { useNavigation } from '@granite-js/react-native';
import { useLayoutEffect } from 'react';

/** PageNavbar preference:none 등이 headerShown:false를 넣지 못하도록 매 화면에서 재설정 */
export function useTossHeader() {
  const navigation = useNavigation();

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
    });
  }, [navigation]);
}
