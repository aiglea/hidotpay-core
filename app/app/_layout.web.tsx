import { LogtoProvider } from '@logto/react';
import { Stack } from 'expo-router';

import { logtoEndpoint, logtoWebAppId } from '../src/auth-config';

export default function WebRootLayout() {
  return (
    <LogtoProvider config={{ endpoint: logtoEndpoint, appId: logtoWebAppId }}>
      <Stack screenOptions={{ headerShown: false }} />
    </LogtoProvider>
  );
}
