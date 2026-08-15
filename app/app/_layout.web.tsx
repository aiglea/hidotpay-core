import { LogtoProvider } from '@logto/react';
import { Stack } from 'expo-router';

import { ledgerApiResource, logtoEndpoint, logtoWebAppId } from '../src/auth-config';

export default function WebRootLayout() {
  return (
    <LogtoProvider config={{ endpoint: logtoEndpoint, appId: logtoWebAppId, ...(ledgerApiResource ? { resources: [ledgerApiResource] } : {}) }}>
      <Stack screenOptions={{ headerShown: false }} />
    </LogtoProvider>
  );
}
