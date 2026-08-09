-- ─────────────────────────────────────────────────────────────────────────
-- Account deletion grace period was never actually enforced: deleteAccount()
-- computed a "scheduled for permanent deletion on X" date for the
-- confirmation email only — it was never persisted, and nothing ever
-- purged the account afterward. Soft-deleted accounts stayed soft-deleted
-- indefinitely despite what the email promised.
--
-- This migration adds a completion marker so the purge job (both the
-- per-user delayed job and the periodic sweep) can tell which DELETED
-- accounts still need purging vs. which have already been processed.
--
-- Purging anonymizes the row rather than issuing a hard DELETE — users.id
-- is referenced ON DELETE RESTRICT from messages, digital_delivery_tokens,
-- and other tables that must keep their historical/financial trail intact,
-- so a raw DELETE FROM users would fail for any account with real activity.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS purged_at TIMESTAMPTZ;

COMMENT ON COLUMN public.users.purged_at IS
  'Set once the account''s PII has been anonymized after its deletion grace period elapsed. NULL means either the account was never deleted, or it is deleted but still within (or awaiting) its grace period.';

-- Sweep query pattern: WHERE status = 'DELETED' AND deleted_at <= cutoff
-- AND purged_at IS NULL. Partial index keeps this cheap regardless of how
-- large the users table grows, since the vast majority of rows will never
-- match (only ever a small, transient backlog of pending purges).
CREATE INDEX IF NOT EXISTS idx_users_pending_purge
  ON public.users (deleted_at)
  WHERE status = 'DELETED' AND purged_at IS NULL;
