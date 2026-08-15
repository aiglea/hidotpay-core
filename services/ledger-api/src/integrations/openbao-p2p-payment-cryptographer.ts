export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** OpenBao Transit boundary for P2P payment details; the database receives ciphertext only. */
export class OpenBaoP2PPaymentCryptographer {
  private readonly endpoint: string;

  public constructor(private readonly options: { fetch?: FetchLike; token: string; url: string }) {
    const parsed = new URL(options.url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) throw new Error('OpenBao payment cryptographer requires a private HTTPS URL');
    if (!options.token || options.token.length < 16) throw new Error('OpenBao payment cryptographer requires a service token');
    this.endpoint = `${parsed.toString().replace(/\/$/, '')}/v1/transit/encrypt/hidotpay-p2p-payment-data`;
  }

  public async encrypt(plaintext: string): Promise<string> {
    if (!plaintext || plaintext.length > 2_000) throw new Error('P2P payment payload is invalid');
    const response = await (this.options.fetch ?? fetch)(this.endpoint, {
      body: JSON.stringify({ plaintext: Buffer.from(plaintext, 'utf8').toString('base64') }),
      headers: { 'Content-Type': 'application/json', 'X-Vault-Token': this.options.token },
      method: 'POST',
    });
    const payload = await response.json().catch(() => undefined) as { data?: { ciphertext?: unknown } } | undefined;
    const ciphertext = payload?.data?.ciphertext;
    if (!response.ok || typeof ciphertext !== 'string' || !/^vault:v\d+:[A-Za-z0-9+/=_-]+$/.test(ciphertext)) {
      throw new Error('OpenBao payment encryption failed');
    }
    return ciphertext;
  }
}
