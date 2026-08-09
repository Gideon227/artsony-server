-- ─────────────────────────────────────────────────────────────────────────
-- Durable, DB-enforced idempotency for message sends.
--
-- The existing guard in messageService.send() uses a Redis SET NX with a
-- 'pending' placeholder, updated to the real message id only after the
-- message is persisted. Two concurrent requests for the same
-- client_message_id (double-tapped send, network retry racing the
-- original) can both observe 'pending' and both fall through to insert a
-- row — the Redis key alone does not prevent the duplicate.
--
-- This migration adds a client-generated dedup key directly on the
-- messages table with a unique index, so Postgres itself rejects the
-- second concurrent insert. Redis remains as a fast-path cache to avoid a
-- DB round trip for the common non-concurrent case; this index is the
-- actual correctness guarantee.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS client_message_id UUID;

COMMENT ON COLUMN public.messages.client_message_id IS
  'Client-generated UUID used to de-duplicate retried/double-tapped sends. NULL for legacy rows and messages inserted outside the normal send path (e.g. broadcast fan-out internals).';

-- Partial unique index: Postgres allows any number of NULLs under a
-- UNIQUE index, so this only constrains rows that actually supplied a
-- client_message_id.
CREATE UNIQUE INDEX IF NOT EXISTS messages_client_message_id_uidx
  ON public.messages (client_message_id)
  WHERE client_message_id IS NOT NULL;
