-- Tracks when each background sync last ran, so the Inventory page can
-- auto-refresh stale data (at most once per interval, however many people
-- open the page) and the nightly cron knows what it did.
CREATE TABLE IF NOT EXISTS ims_sync_state (
  "key" text PRIMARY KEY,
  "lastStartedAt" timestamptz,
  "lastFinishedAt" timestamptz,
  "lastStatus" text,
  "lastSummary" jsonb,
  "lastError" text
);
