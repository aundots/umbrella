import { useEffect } from 'react';
import { useNavigation } from '@granite-js/react-native';
import { tdsEvent } from '@toss/tds-react-native';

/** granite.config navigationBar.initialAccessoryButton 이벤트 처리 */
export function NavigationSetup() {
  const navigation = useNavigation();

  useEffect(() => {
    return tdsEvent.addEventListener('navigationAccessoryEvent', {
      onEvent: ({ id }) => {
        if (id === 'settings') {
          navigation.navigate('/settings');
        }
      },
    });
  }, [navigation]);

  return null;
}
