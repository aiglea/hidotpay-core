export type BlnkHttp = {
  request(method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown>;
};

export type BlnkDepositCredit = {
  amountAtoms: string;
  assetCode: string;
  destinationAccountId: string;
  ledgerTransactionId: string;
  precision: string;
};

type BlnkTransactionResponse = {
  id?: unknown;
  status?: unknown;
};

/**
 * Blnk is a secondary, independently reconcilable ledger. The CockroachDB
 * transaction id is used as Blnk's immutable, idempotent business reference.
 */
export class BlnkLedgerClient {
  public constructor(private readonly http: BlnkHttp) {}

  public async recordDepositCredit(input: BlnkDepositCredit): Promise<{ blnkTransactionId: string; status: string }> {
    this.validateCredit(input);
    const reference = this.transactionReference(input.ledgerTransactionId);
    try {
      const response = await this.http.request('POST', '/transactions', {
        allow_overdraft: true,
        currency: input.assetCode,
        description: 'HiDot Pay confirmed chain deposit',
        destination: this.accountIndicator(input.destinationAccountId),
        meta_data: {
          hidotpay_ledger_transaction_id: input.ledgerTransactionId,
          transaction_type: 'deposit_credit',
        },
        precise_amount: input.amountAtoms,
        precision: input.precision,
        reference,
        skip_queue: false,
        source: '@hidotpay:platform:settlement',
      });
      return parseTransactionResponse(response);
    } catch (originalError) {
      try {
        return await this.findTransactionByReference(reference);
      } catch {
        throw originalError;
      }
    }
  }

  public async findTransactionByReference(reference: string): Promise<{ blnkTransactionId: string; status: string }> {
    if (!/^hidotpay:ledger:[0-9a-f-]{36}$/i.test(reference)) throw new Error('Blnk reference is invalid');
    const initial = await this.findTransaction(reference);
    if (initial.status !== 'QUEUED') return initial;
    try {
      return await this.findTransaction(`${reference}_q`);
    } catch {
      // Blnk has accepted the transaction but has not generated its processed
      // child record yet. The caller records QUEUED and retries later.
      return initial;
    }
  }

  public accountIndicator(accountId: string): string {
    return `@hidotpay:account:${accountId}`;
  }

  public transactionReference(ledgerTransactionId: string): string {
    return `hidotpay:ledger:${ledgerTransactionId}`;
  }

  private validateCredit(input: BlnkDepositCredit): void {
    if (!/^[1-9][0-9]*$/.test(input.amountAtoms)) throw new Error('Blnk precise amount must be a positive atom string');
    if (!/^[A-Za-z0-9._:-]{2,64}$/.test(input.assetCode)) throw new Error('Blnk asset code is invalid');
    if (!/^[0-9a-f-]{36}$/i.test(input.destinationAccountId) || !/^[0-9a-f-]{36}$/i.test(input.ledgerTransactionId)) {
      throw new Error('Blnk account or ledger transaction id is invalid');
    }
    if (!/^[1-9][0-9]*$/.test(input.precision)) throw new Error('Blnk precision is invalid');
  }

  private async findTransaction(reference: string): Promise<{ blnkTransactionId: string; status: string }> {
    const response = await this.http.request('GET', `/transactions/reference/${encodeURIComponent(reference)}`);
    return parseTransactionResponse(response);
  }
}

function parseTransactionResponse(response: unknown): { blnkTransactionId: string; status: string } {
  const transaction = response as BlnkTransactionResponse & { transaction_id?: unknown };
  const id = typeof transaction.id === 'string' ? transaction.id : transaction.transaction_id;
  if (typeof id !== 'string' || id.length === 0 || typeof transaction.status !== 'string' || transaction.status.length === 0) {
    throw new Error('Blnk transaction response is invalid');
  }
  return { blnkTransactionId: id, status: transaction.status };
}

/** A narrow HTTP transport which emits `precise_amount` as a JSON integer, never a floating-point number. */
export function createFetchBlnk(baseUrl: string, apiKey: string): BlnkHttp {
  const normalizedUrl = baseUrl.replace(/\/$/, '');
  if (!/^https?:\/\/[^/]+(?:\/.*)?$/i.test(normalizedUrl)) throw new Error('BLNK_URL must be an HTTP(S) URL');
  if (apiKey.length === 0) throw new Error('BLNK_KEY is required');
  return {
    async request(method, path, body) {
      const serialized = serializeBlnkBody(body);
      const response = await fetch(`${normalizedUrl}${path}`, {
        body: serialized,
        headers: { 'content-type': 'application/json', 'x-blnk-key': apiKey },
        method,
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`Blnk ${method} ${path} returned HTTP ${response.status}`);
      return text.length === 0 ? {} : JSON.parse(text) as unknown;
    },
  };
}

function serializeBlnkBody(body: unknown): string | undefined {
  if (body === undefined) return undefined;
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Blnk request body is invalid');
  const record = body as Record<string, unknown>;
  const amountAtoms = record.precise_amount;
  const precision = record.precision;
  if (typeof amountAtoms !== 'string' || !/^[1-9][0-9]*$/.test(amountAtoms) || typeof precision !== 'string' || !/^[1-9][0-9]*$/.test(precision)) return JSON.stringify(body);
  const json = JSON.stringify(body);
  return json
    .replace(`"precise_amount":"${amountAtoms}"`, `"precise_amount":${amountAtoms}`)
    .replace(`"precision":"${precision}"`, `"precision":${precision}`);
}
