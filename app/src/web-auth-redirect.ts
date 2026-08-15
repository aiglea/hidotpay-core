type WebAuthRedirectUris = {
  postLogoutRedirectUri: string;
  redirectUri: string;
};

const localDevelopmentOrigin = 'http://localhost:3000';

export function webAuthRedirectUris(origin: string | undefined): WebAuthRedirectUris {
  let parsed: URL;
  try {
    parsed = new URL(origin ?? localDevelopmentOrigin);
  } catch {
    parsed = new URL(localDevelopmentOrigin);
  }

  const allowsHttp = parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '[::1]');
  const allowed = parsed.protocol === 'https:' || allowsHttp;
  const normalizedOrigin = allowed ? parsed.origin : localDevelopmentOrigin;
  return {
    postLogoutRedirectUri: normalizedOrigin,
    redirectUri: `${normalizedOrigin}/callback`,
  };
}
