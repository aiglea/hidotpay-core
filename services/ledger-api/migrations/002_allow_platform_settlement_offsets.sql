-- The platform settlement account is the ledger counterparty for confirmed
-- on-chain deposits. It can be negative while user accounts remain protected
-- by the transactional balance checks in the application service.
ALTER TABLE account_balances DROP CONSTRAINT IF EXISTS account_balances_balance_atoms_check;
