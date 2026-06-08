import { appsInToss } from '@apps-in-toss/framework/plugins';
import { defineConfig } from '@granite-js/react-native/config';

export default defineConfig({
  scheme: 'intoss',
  appName: 'umbrella',
  plugins: [
    appsInToss({
      brand: {
        displayName: '우산챙겨',
        primaryColor: '#5B9BD5',
        icon: '',
        bridgeColorMode: 'basic',
      },
      permissions: [],
    }),
  ],
});
