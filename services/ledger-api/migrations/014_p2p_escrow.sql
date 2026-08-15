ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_account_kind_check;
ALTER TABLE accounts ADD CONSTRAINT accounts_account_kind_check CHECK (account_kind IN (
  'user_available', 'user_frozen', 'p2p_escrow', 'platform_treasury', 'platform_settlement'
));

ALTER TABLE ledger_transactions DROP CONSTRAINT IF EXISTS ledger_transactions_transaction_type_check;
ALTER TABLE ledger_transactions ADD CONSTRAINT ledger_transactions_transaction_type_check CHECK (transaction_type IN (
  'deposit_credit', 'internal_transfer', 'p2p_escrow_lock', 'p2p_escrow_refund', 'p2p_escrow_release',
  'withdrawal_freeze', 'withdrawal_release', 'withdrawal_settle'
));

CREATE TABLE p2p_ads (
  id UUID PRIMARY KEY,
  seller_id STRING NOT NULL,
  asset_code STRING NOT NULL REFERENCES assets (code),
  fiat_currency STRING NOT NULL,
  price_atoms DECIMAL(39, 0) NOT NULL CHECK (price_atoms > 0),
  min_amount_atoms DECIMAL(39, 0) NOT NULL CHECK (min_amount_atoms > 0),
  max_amount_atoms DECIMAL(39, 0) NOT NULL CHECK (max_amount_atoms >= min_amount_atoms),
  payment_method_code STRING NOT NULL,
  status STRING NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX p2p_ads_active_lookup_idx ON p2p_ads (status, asset_code, fiat_currency, created_at DESC);

CREATE TABLE p2p_orders (
  id UUID PRIMARY KEY,
  ad_id UUID NOT NULL REFERENCES p2p_ads (id),
  buyer_id STRING NOT NULL,
  seller_id STRING NOT NULL,
  seller_available_account_id UUID NOT NULL REFERENCES accounts (id),
  escrow_account_id UUID NOT NULL REFERENCES accounts (id) UNIQUE,
  asset_code STRING NOT NULL REFERENCES assets (code),
  amount_atoms DECIMAL(39, 0) NOT NULL CHECK (amount_atoms > 0),
  fiat_currency STRING NOT NULL,
  price_atoms DECIMAL(39, 0) NOT NULL CHECK (price_atoms > 0),
  payment_method_code STRING NOT NULL,
  status STRING NOT NULL CHECK (status IN ('awaiting_payment', 'awaiting_release', 'cancelled', 'disputed', 'released')),
  dispute_opened_by STRING,
  released_by STRING,
  cancelled_by STRING,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (buyer_id <> seller_id)
);

CREATE INDEX p2p_orders_buyer_status_idx ON p2p_orders (buyer_id, status, created_at DESC);
CREATE INDEX p2p_orders_seller_status_idx ON p2p_orders (seller_id, status, created_at DESC);

CREATE TABLE p2p_disputes (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL UNIQUE REFERENCES p2p_orders (id),
  opened_by STRING NOT NULL,
  reason_code STRING NOT NULL,
  status STRING NOT NULL CHECK (status IN ('open', 'resolved_buyer', 'resolved_seller')),
  resolved_by STRING,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE VIEW admin_p2p_orders AS
SELECT id, ad_id, buyer_id, seller_id, asset_code, amount_atoms, fiat_currency, price_atoms,
       payment_method_code, status, dispute_opened_by, released_by, cancelled_by, created_at, updated_at
FROM p2p_orders;

CREATE VIEW admin_p2p_disputes AS
SELECT id, order_id, opened_by, reason_code, status, resolved_by, created_at, resolved_at
FROM p2p_disputes;
