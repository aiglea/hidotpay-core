ALTER TABLE outbox_events ADD COLUMN lease_owner STRING;
ALTER TABLE outbox_events ADD COLUMN lease_until TIMESTAMPTZ;
ALTER TABLE outbox_events ADD COLUMN last_error STRING;

CREATE INDEX outbox_events_claim_idx ON outbox_events (published_at, lease_until, created_at);
