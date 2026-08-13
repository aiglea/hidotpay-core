-- CockroachDB names unnamed CHECK constraints as check_<column>.  Migration 002
-- used a descriptive name that was not the server-generated name, so this
-- follow-up removes the actual legacy constraint without changing prior files.
ALTER TABLE account_balances DROP CONSTRAINT IF EXISTS check_balance_atoms;
