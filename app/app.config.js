const logtoEndpoint = process.env.EXPO_PUBLIC_LOGTO_ENDPOINT ?? 'https://ngu7sy.logto.app';
const logtoWebAppId = process.env.EXPO_PUBLIC_LOGTO_WEB_APP_ID ?? 'tlc4kgyfsukbz60exkmun';
const logtoNativeAppId = process.env.EXPO_PUBLIC_LOGTO_NATIVE_APP_ID ?? 'jmefg2ses94nuvrkrc07i';
const ledgerApiBaseUrl = process.env.EXPO_PUBLIC_LEDGER_API_BASE_URL ?? '';
const ledgerApiResource = process.env.EXPO_PUBLIC_LEDGER_API_RESOURCE ?? '';

module.exports = {
  expo: {
    name: 'hidotpay',
    slug: 'hidotpay-wallet',
    version: '0.2.54',
    orientation: 'portrait',
    scheme: 'hidotpay',
    userInterfaceStyle: 'light',
    plugins: ['expo-router', 'expo-secure-store'],
    web: { bundler: 'metro' },
    android: { package: 'com.hidotpay.logintest' },
    extra: { ledgerApiBaseUrl, ledgerApiResource, logtoEndpoint, logtoWebAppId, logtoNativeAppId },
  },
};
