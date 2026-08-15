export type Balance = {
  assetCode: string;
  balanceAtoms: string;
};

export type WalletSnapshot = {
  accountId: string;
  balances: Balance[];
};

export type WalletApiInput = {
  apiBaseUrl: string;
  accessToken: string;
  fetchImpl?: typeof fetch;
};

export type WalletTransaction = {
  id: string;
  type: string;
  assetCode: string;
  amountAtoms: string;
  direction: string;
  createdAt: string;
};

export type WalletTransactionPage = {
  transactions: WalletTransaction[];
  nextCursor?: string;
};

export type DepositAddress = {
  address: string;
  keyVersion: string;
  network: string;
};

export type InternalTransferRequest = WalletApiInput & {
  amountAtoms: string;
  assetCode: string;
  idempotencyKey: string;
  recipientWalletId: string;
};

function normalizedBaseUrl(apiBaseUrl: string): string {
  const value = apiBaseUrl.trim().replace(/\/+$/, '');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('尚未設定可用的錢包服務網址。');
  }
  if (url.protocol !== 'https:') throw new Error('錢包服務必須使用 HTTPS。');
  return url.toString().replace(/\/+$/, '');
}

function failureMessageFrom(response: Response, fallback: string, codeMessages: Record<string, string> = {}): Promise<string> {
  return response.clone().json().then((payload: unknown) => {
    const code = payload && typeof payload === 'object' && !Array.isArray(payload) ? (payload as { code?: unknown }).code : undefined;
    return typeof code === 'string' && codeMessages[code] ? codeMessages[code] : fallback;
  }).catch(() => fallback);
}

async function requestJson<T>(
  input: WalletApiInput,
  path: string,
  init: RequestInit = {},
  failureMessage = '未能讀取錢包資料，請稍後再試。',
  codeMessages: Record<string, string> = {},
): Promise<T> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(`${normalizedBaseUrl(input.apiBaseUrl)}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) throw new Error(await failureMessageFrom(response, failureMessage, codeMessages));
  return response.json() as Promise<T>;
}

export async function getWalletSnapshot(input: WalletApiInput): Promise<WalletSnapshot> {
  const response = await requestJson<{
    account_id: string;
    balances: Array<{ asset_code: string; balance_atoms: string }>;
  }>(input, '/v1/me/balances');

  return {
    accountId: response.account_id,
    balances: response.balances.map((balance) => ({ assetCode: balance.asset_code, balanceAtoms: balance.balance_atoms })),
  };
}

export async function getWalletTransactions(input: WalletApiInput & { cursor?: string }): Promise<WalletTransactionPage> {
  const query = new URLSearchParams({ limit: '20' });
  if (input.cursor) query.set('cursor', input.cursor);
  const response = await requestJson<{
    next_cursor: string | null;
    transactions: Array<{
      amount_atoms: string;
      asset_code: string;
      created_at: string;
      direction: string;
      id: string;
      type: string;
    }>;
  }>(input, `/v1/me/transactions?${query.toString()}`, {}, '未能讀取交易紀錄，請稍後再試。');

  return {
    nextCursor: response.next_cursor ?? undefined,
    transactions: response.transactions.map((transaction) => ({
      id: transaction.id,
      type: transaction.type,
      assetCode: transaction.asset_code,
      amountAtoms: transaction.amount_atoms,
      direction: transaction.direction,
      createdAt: transaction.created_at,
    })),
  };
}

export async function allocateDepositAddress(input: WalletApiInput & { network: string }): Promise<DepositAddress> {
  const response = await requestJson<{ address: string; key_version: string; network: string }>(
    input,
    '/v1/me/wallet-addresses',
    { body: JSON.stringify({ network: input.network }), headers: { 'Content-Type': 'application/json' }, method: 'POST' },
    '未能建立充值地址，請稍後再試。',
    {
      forbidden: '沒有權限建立充值地址。',
      invalid_network: '不支援這個充值網路。',
      signer_key_not_configured: '充值地址金鑰尚未設定。',
      signer_rejected: '充值地址服務拒絕此次請求，請稍後再試。',
      signer_returned_invalid_address: '充值地址格式無效。',
      signer_unavailable: '充值地址服務尚未連上，請稍後再試。',
      unauthenticated: '請重新登入後再試。',
    },
  );

  return { address: response.address, keyVersion: response.key_version, network: response.network };
}

export async function submitInternalTransfer(input: InternalTransferRequest): Promise<{ transferId: string }> {
  const response = await requestJson<{ status: string; transfer_id: string }>(
    input,
    '/v1/me/internal-transfers',
    {
      body: JSON.stringify({
        amount_atoms: input.amountAtoms,
        asset_code: input.assetCode,
        recipient_wallet_id: input.recipientWalletId,
      }),
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': input.idempotencyKey },
      method: 'POST',
    },
    '站內轉帳沒有完成，請確認收款帳戶與餘額後再試。',
  );

  if (response.status !== 'committed' || !response.transfer_id) throw new Error('站內轉帳沒有完成，請稍後再試。');
  return { transferId: response.transfer_id };
}
