import { useNavigation } from '@granite-js/react-native';
import { tdsEvent } from '@toss/tds-react-native';
import { useEffect } from 'react';

/** granite.config navigationBar.initialAccessoryButton → /settings */
export function useNavigationAccessory() {
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
}
