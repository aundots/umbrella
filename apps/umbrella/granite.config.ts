import { appsInToss } from '@apps-in-toss/framework/plugins';
import { defineConfig } from '@granite-js/react-native/config';

/** 콘솔 앱 로고 우클릭 → 이미지 주소 복사 (brand.config.ts와 동일 URL 유지) */
const BRAND_ICON_URL =
  'https://static.toss.im/appsintoss/42935/4a7cfa70-e5c5-4f5d-b787-05c2e2ce36e4.png';

export default defineConfig({
  scheme: 'intoss',
  appName: 'umbrella',
  plugins: [
    appsInToss({
      brand: {
        displayName: '우산챙겨',
        primaryColor: '#5B9BD5',
        icon: BRAND_ICON_URL,
      },
      permissions: [{ name: 'geolocation', access: 'access' }],
    }),
  ],
});
