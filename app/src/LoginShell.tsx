import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { OnboardingFlow } from './OnboardingFlow';

type LoginShellProps = {
  authenticated: boolean;
  busy: boolean;
  username?: string;
  error?: string;
  onSignIn: () => void;
  onSignOut: () => void;
  onSignUp: () => void;
  children?: ReactNode;
};

export function LoginShell({ authenticated, busy, error, onSignIn, onSignUp, children }: LoginShellProps) {
  if (!authenticated) return <OnboardingFlow busy={busy} error={error} onSignIn={onSignIn} onSignUp={onSignUp} />;
  return <View style={styles.authenticated}>{children}</View>;
}

const styles = StyleSheet.create({ authenticated: { flex: 1 } });
