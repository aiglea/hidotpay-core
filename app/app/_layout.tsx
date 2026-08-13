import { Stack } from 'expo-router';

// Expo Router requires an extension-free root layout as a fallback. Web and native
// use the platform-specific layouts beside this file.
export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
