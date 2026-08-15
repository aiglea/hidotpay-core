import Constants from 'expo-constants';

import { webAuthRedirectUris } from './web-auth-redirect';

type LogtoExtra = {
  ledgerApiBaseUrl?: string;
  ledgerApiResource?: string;
  logtoEndpoint?: string;
  logtoWebAppId?: string;
  logtoNativeAppId?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as LogtoExtra;

export const logtoEndpoint = extra.logtoEndpoint ?? 'https://ngu7sy.logto.app';
export const logtoWebAppId = extra.logtoWebAppId ?? 'tlc4kgyfsukbz60exkmun';
export const logtoNativeAppId = extra.logtoNativeAppId ?? 'jmefg2ses94nuvrkrc07i';
export const ledgerApiBaseUrl = extra.ledgerApiBaseUrl ?? '';
export const ledgerApiResource = extra.ledgerApiResource ?? '';
const webAuthUris = webAuthRedirectUris(typeof window === 'undefined' ? undefined : window.location.origin);
export const webRedirectUri = webAuthUris.redirectUri;
export const webPostLogoutRedirectUri = webAuthUris.postLogoutRedirectUri;
export const nativeRedirectUri = 'hidotpay://callback';
