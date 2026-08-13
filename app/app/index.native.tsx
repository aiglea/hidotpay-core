import { useLogto } from '@logto/rn';
import { useEffect, useState } from 'react';

import { LoginShell } from '../src/LoginShell';

export default function NativeHomeScreen() {
  const { getIdTokenClaims, isAuthenticated, isInitialized, signIn, signOut } = useLogto();
  const [username, setUsername] = useState<string>();
  const [actionError, setActionError] = useState<string>();

  useEffect(() => {
    if (!isAuthenticated) {
      setUsername(undefined);
      return;
    }

    void getIdTokenClaims().then((claims) => {
      setUsername(claims.username ?? claims.name ?? claims.email ?? '使用者');
    });
  }, [getIdTokenClaims, isAuthenticated]);

  const beginSignIn = () => {
    setActionError(undefined);
    void signIn('hidotpay://callback').catch((reason: unknown) => {
      setActionError(reason instanceof Error ? reason.message : '無法開始登入，請稍後再試。');
    });
  };

  const beginSignOut = () => {
    setActionError(undefined);
    void signOut().catch((reason: unknown) => {
      setActionError(reason instanceof Error ? reason.message : '無法完成登出，請稍後再試。');
    });
  };

  return (
    <LoginShell
      authenticated={isAuthenticated}
      busy={!isInitialized}
      error={actionError}
      onSignIn={beginSignIn}
      onSignOut={beginSignOut}
      username={username}
    />
  );
}
