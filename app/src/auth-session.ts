export function isInvalidAuthGrant(reason: unknown): boolean {
  if (!reason || typeof reason !== 'object') return false;
  const record = reason as { code?: unknown; error?: unknown; message?: unknown };
  const code = typeof record.code === 'string' ? record.code : '';
  const error = typeof record.error === 'string' ? record.error : '';
  const message = typeof record.message === 'string' ? record.message : '';
  return code.endsWith('invalid_grant') || error === 'invalid_grant' || message.includes('invalid_grant') || message.includes('授權請求無效');
}

export function createLedgerTokenReader(
  getAccessToken: (resource: string) => Promise<string>,
  resource: string,
): () => Promise<string> {
  let inflight: Promise<string> | undefined;
  return () => {
    if (!inflight) {
      inflight = getAccessToken(resource).finally(() => {
        inflight = undefined;
      });
    }
    return inflight;
  };
}
