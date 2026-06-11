import { AppsInToss } from '@apps-in-toss/framework';
import { PropsWithChildren } from 'react';
import { InitialProps } from '@granite-js/react-native';
import { TDSProvider } from '@toss/tds-react-native';
import { context } from '../require.context';
import { AuthProvider } from './auth/AuthContext';
import { LocationProvider } from './hooks/useLocations';
import { RelayProvider } from './context/RelayContext';
function AppContainer({ children }: PropsWithChildren<InitialProps>) {
  return (
    <TDSProvider>
      <AuthProvider>
        <LocationProvider>
          <RelayProvider>{children}</RelayProvider>
        </LocationProvider>
      </AuthProvider>
    </TDSProvider>
  );
}

export default AppsInToss.registerApp(AppContainer, { context });
