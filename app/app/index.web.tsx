import { useLogto } from '@logto/react';
import { useEffect, useState } from 'react';

import { LoginShell } from '../src/LoginShell';
import { webPostLogoutRedirectUri, webRedirectUri } from '../src/auth-config';

export default function WebHomeScreen() {
  const { error, getIdTokenClaims, isAuthenticated, isLoading, signIn, signOut } = useLogto();
  const [username, setUsername] = useState<string>();
  const [actionError, setActionError] = useState<string>();

  useEffect(() => {
    if (!isAuthenticated) {
      setUsername(undefined);
      return;
    }

    void getIdTokenClaims().then((claims) => {
      setUsername(claims?.username ?? claims?.name ?? claims?.email ?? '使用者');
    });
  }, [getIdTokenClaims, isAuthenticated]);

  const beginSignIn = () => {
    setActionError(undefined);
    void signIn(webRedirectUri).catch((reason: unknown) => {
      setActionError(reason instanceof Error ? reason.message : '無法開始登入，請稍後再試。');
    });
  };

  const beginSignOut = () => {
    setActionError(undefined);
    void signOut(webPostLogoutRedirectUri).catch((reason: unknown) => {
      setActionError(reason instanceof Error ? reason.message : '無法完成登出，請稍後再試。');
    });
  };

  return (
    <LoginShell
      authenticated={isAuthenticated}
      busy={isLoading}
      error={actionError ?? error?.message}
      onSignIn={beginSignIn}
      onSignOut={beginSignOut}
      username={username}
    />
  );
}
