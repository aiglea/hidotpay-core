const logtoEndpoint = process.env.EXPO_PUBLIC_LOGTO_ENDPOINT ?? 'https://ngu7sy.logto.app';
const logtoWebAppId = process.env.EXPO_PUBLIC_LOGTO_WEB_APP_ID ?? 'tlc4kgyfsukbz60exkmun';
const logtoNativeAppId = process.env.EXPO_PUBLIC_LOGTO_NATIVE_APP_ID ?? 'jmefg2ses94nuvrkrc07i';

module.exports = {
  expo: {
    name: 'hidotpay Login Test',
    slug: 'hidotpay-login-test',
    version: '0.1.0',
    orientation: 'portrait',
    scheme: 'hidotpay',
    userInterfaceStyle: 'light',
    plugins: ['expo-router', 'expo-secure-store'],
    web: { bundler: 'metro' },
    android: { package: 'com.hidotpay.logintest' },
    extra: { logtoEndpoint, logtoWebAppId, logtoNativeAppId },
  },
};
