import { LogtoProvider } from '@logto/rn';
import { Stack } from 'expo-router';

import { logtoEndpoint, logtoNativeAppId } from '../src/auth-config';

export default function NativeRootLayout() {
  return (
    <LogtoProvider config={{ endpoint: logtoEndpoint, appId: logtoNativeAppId }}>
      <Stack screenOptions={{ headerShown: false }} />
    </LogtoProvider>
  );
}
