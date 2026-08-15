import Constants from 'expo-constants';

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
export const webRedirectUri = 'http://localhost:3000/callback';
export const webPostLogoutRedirectUri = 'http://localhost:3000';
export const nativeRedirectUri = 'hidotpay://callback';
