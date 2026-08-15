import { useLogto } from '@logto/rn';
import { useEffect, useState } from 'react';

import { LoginShell } from '../src/LoginShell';
import { WalletHome } from '../src/WalletHome';
import { ledgerApiBaseUrl, ledgerApiResource } from '../src/auth-config';

export default function NativeHomeScreen() {
  const { getAccessToken, getIdTokenClaims, isAuthenticated, isInitialized, signIn, signOut } = useLogto();
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

  const beginSignUp = () => {
    setActionError(undefined);
    void signIn({ firstScreen: 'register', redirectUri: 'hidotpay://callback' }).catch((reason: unknown) => {
      setActionError(reason instanceof Error ? reason.message : '無法開始建立帳戶，請稍後再試。');
    });
  };

  const beginSignOut = () => {
    setActionError(undefined);
    void signOut().catch((reason: unknown) => {
      setActionError(reason instanceof Error ? reason.message : '無法完成登出，請稍後再試。');
    });
  };

  if (isAuthenticated) {
    return (
      <WalletHome
        apiBaseUrl={ledgerApiBaseUrl && ledgerApiResource ? ledgerApiBaseUrl : ''}
        getAccessToken={() => {
          if (!ledgerApiResource) return Promise.reject(new Error('錢包服務尚未完成 API 權限設定。'));
          return getAccessToken(ledgerApiResource);
        }}
        onSignOut={beginSignOut}
        username={username}
      />
    );
  }

  return (
    <LoginShell
      authenticated={false}
      busy={!isInitialized}
      error={actionError}
      onSignIn={beginSignIn}
      onSignOut={beginSignOut}
      onSignUp={beginSignUp}
      username={username}
    />
  );
}
