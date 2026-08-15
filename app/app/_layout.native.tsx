import { LogtoProvider } from '@logto/rn';
import { Stack } from 'expo-router';

import { ledgerApiResource, logtoEndpoint, logtoNativeAppId } from '../src/auth-config';

export default function NativeRootLayout() {
  return (
    <LogtoProvider config={{ endpoint: logtoEndpoint, appId: logtoNativeAppId, ...(ledgerApiResource ? { resources: [ledgerApiResource] } : {}) }}>
      <Stack screenOptions={{ headerShown: false }} />
    </LogtoProvider>
  );
}
