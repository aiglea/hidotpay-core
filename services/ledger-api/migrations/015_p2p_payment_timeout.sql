-- Payment windows are persisted once, at order creation.  The timeout worker
-- may refund only orders which remain in awaiting_payment after this deadline.
ALTER TABLE p2p_orders ADD COLUMN IF NOT EXISTS payment_deadline_at TIMESTAMPTZ;

UPDATE p2p_orders
   SET payment_deadline_at = created_at + INTERVAL '15 minutes'
 WHERE payment_deadline_at IS NULL;

ALTER TABLE p2p_orders ALTER COLUMN payment_deadline_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS p2p_orders_payment_deadline_idx
  ON p2p_orders (payment_deadline_at)
  WHERE status = 'awaiting_payment';

CREATE OR REPLACE VIEW admin_p2p_orders AS
SELECT id, ad_id, buyer_id, seller_id, asset_code, amount_atoms, fiat_currency, price_atoms,
       payment_method_code, status, dispute_opened_by, released_by,
       cancelled_by, created_at, updated_at, payment_deadline_at
FROM p2p_orders;
