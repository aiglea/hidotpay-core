import { useLogto } from '@logto/rn';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { LoginShell } from '../src/LoginShell';
import { WalletHome } from '../src/WalletHome';
import { ledgerApiBaseUrl, ledgerApiResource } from '../src/auth-config';
import { createLedgerTokenReader, isInvalidAuthGrant } from '../src/auth-session';

export default function NativeHomeScreen() {
  const { client, getAccessToken, getIdTokenClaims, isAuthenticated, isInitialized, signIn, signOut } = useLogto();
  const [username, setUsername] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [sessionExpired, setSessionExpired] = useState(false);
  const readLedgerToken = useMemo(
    () => createLedgerTokenReader((resource) => getAccessToken(resource), ledgerApiResource),
    [getAccessToken],
  );
  const expireSession = useCallback(async () => {
    setSessionExpired(true);
    setActionError('登入已過期，請重新登入。');
    await client.clearAllTokens().catch(() => undefined);
  }, [client]);
  const requestLedgerToken = useCallback(async () => {
    if (!ledgerApiResource) throw new Error('錢包服務尚未完成 API 權限設定。');
    try {
      return await readLedgerToken();
    } catch (reason) {
      if (isInvalidAuthGrant(reason)) {
        await expireSession();
        throw new Error('登入已過期，請重新登入。');
      }
      throw reason;
    }
  }, [expireSession, readLedgerToken]);

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
    setSessionExpired(false);
    void signIn('hidotpay://callback').catch((reason: unknown) => {
      setActionError(reason instanceof Error ? reason.message : '無法開始登入，請稍後再試。');
    });
  };

  const beginSignUp = () => {
    setActionError(undefined);
    setSessionExpired(false);
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

  if (isAuthenticated && !sessionExpired) {
    return (
      <WalletHome
        apiBaseUrl={ledgerApiBaseUrl && ledgerApiResource ? ledgerApiBaseUrl : ''}
        getAccessToken={requestLedgerToken}
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
