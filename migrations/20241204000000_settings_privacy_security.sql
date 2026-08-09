-- ─────────────────────────────────────────────────────────────────────────
-- Settings page backend support: account deactivation, user blocking, and
-- messaging/comment/purchase privacy preferences (with real enforcement,
-- not just stored preferences — see application code in auth, messaging,
-- comments, and cart modules).
-- ─────────────────────────────────────────────────────────────────────────

-- ── Account deactivation ────────────────────────────────────────────────────
-- Distinct from DELETED: deactivation is self-service, immediately
-- reversible by logging back in, and does not start the deletion grace
-- period / purge job. Cannot run inside the same transaction as code that
-- references the new value — this migration only adds it.
ALTER TYPE user_status ADD VALUE IF NOT EXISTS 'DEACTIVATED';

-- ── Blocked users ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_blocks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_blocks_no_self_block CHECK (blocker_id <> blocked_id),
  CONSTRAINT user_blocks_unique_pair UNIQUE (blocker_id, blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON public.user_blocks (blocker_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON public.user_blocks (blocked_id);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_blocks_deny_all ON public.user_blocks;
CREATE POLICY user_blocks_deny_all ON public.user_blocks
  USING (false) WITH CHECK (false);

-- ── Privacy preferences ──────────────────────────────────────────────────────
-- One row per user, 1:1 with profiles. EVERYONE is the default so existing
-- users see no behavior change until they explicitly tighten a setting.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS who_can_message  TEXT NOT NULL DEFAULT 'EVERYONE'
    CHECK (who_can_message  IN ('EVERYONE', 'FOLLOWERS', 'NO_ONE')),
  ADD COLUMN IF NOT EXISTS who_can_comment  TEXT NOT NULL DEFAULT 'EVERYONE'
    CHECK (who_can_comment  IN ('EVERYONE', 'FOLLOWERS', 'NO_ONE')),
  ADD COLUMN IF NOT EXISTS who_can_purchase TEXT NOT NULL DEFAULT 'EVERYONE'
    CHECK (who_can_purchase IN ('EVERYONE', 'FOLLOWERS', 'NO_ONE'));
