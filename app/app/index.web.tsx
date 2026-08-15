import { useLogto } from '@logto/react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { LoginShell } from '../src/LoginShell';
import { WalletHome } from '../src/WalletHome';
import { ledgerApiBaseUrl, ledgerApiResource, webPostLogoutRedirectUri, webRedirectUri } from '../src/auth-config';
import { createLedgerTokenReader, isInvalidAuthGrant } from '../src/auth-session';

export default function WebHomeScreen() {
  const { clearAllTokens, error, getAccessToken, getIdTokenClaims, isAuthenticated, isLoading, signIn, signOut } = useLogto();
  const [username, setUsername] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const readLedgerToken = useMemo(
    () => createLedgerTokenReader(async (resource) => {
      const token = await getAccessToken(resource);
      if (!token) throw new Error('登入憑證尚未就緒，請重新登入後再試。');
      return token;
    }, ledgerApiResource),
    [getAccessToken],
  );

  useEffect(() => {
    if (!isAuthenticated) {
      setUsername(undefined);
      return;
    }

    void getIdTokenClaims().then((claims) => {
      setUsername(claims?.username ?? claims?.name ?? claims?.email ?? '使用者');
    });
  }, [getIdTokenClaims, isAuthenticated]);

  const expireSession = useCallback(async () => {
    setActionError('登入已過期，請重新登入。');
    await clearAllTokens().catch(() => undefined);
  }, [clearAllTokens]);

  useEffect(() => {
    if (isInvalidAuthGrant(error)) void expireSession();
  }, [error, expireSession]);

  const beginSignIn = () => {
    setActionError(undefined);
    void signIn(webRedirectUri).catch((reason: unknown) => {
      setActionError(reason instanceof Error ? reason.message : '無法開始登入，請稍後再試。');
    });
  };

  const beginSignUp = () => {
    setActionError(undefined);
    void signIn({ firstScreen: 'register', redirectUri: webRedirectUri }).catch((reason: unknown) => {
      setActionError(reason instanceof Error ? reason.message : '無法開始建立帳戶，請稍後再試。');
    });
  };

  const beginSignOut = () => {
    setActionError(undefined);
    void signOut(webPostLogoutRedirectUri).catch((reason: unknown) => {
      setActionError(reason instanceof Error ? reason.message : '無法完成登出，請稍後再試。');
    });
  };

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

  if (isAuthenticated && !isInvalidAuthGrant(error)) {
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
      busy={isLoading}
      error={actionError ?? (isInvalidAuthGrant(error) ? '登入已過期，請重新登入。' : error?.message)}
      onSignIn={beginSignIn}
      onSignOut={beginSignOut}
      onSignUp={beginSignUp}
      username={username}
    />
  );
}
