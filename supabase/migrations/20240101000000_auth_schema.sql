-- ═══════════════════════════════════════════════════════════════════════════
-- Artsony — Auth Schema
-- Run via: supabase db push  OR  paste into Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Extensions ────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Enums ─────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE auth_provider AS ENUM ('local', 'google', 'facebook');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('USER', 'ARTIST', 'MODERATOR', 'ADMIN');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ── users ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                   VARCHAR(255) NOT NULL,
  password_hash           TEXT,
  provider                auth_provider NOT NULL DEFAULT 'local',
  provider_id             VARCHAR(255),
  is_email_verified       BOOLEAN NOT NULL DEFAULT FALSE,
  onboarded               BOOLEAN NOT NULL DEFAULT FALSE,
  role                    user_role NOT NULL DEFAULT 'USER',
  status                  user_status NOT NULL DEFAULT 'ACTIVE',
  token_version           INTEGER NOT NULL DEFAULT 0,
  failed_login_attempts   INTEGER NOT NULL DEFAULT 0,
  locked_until            TIMESTAMPTZ,
  last_login_at           TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at              TIMESTAMPTZ,

  CONSTRAINT users_email_unique UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_users_email        ON public.users (lower(email));
CREATE INDEX IF NOT EXISTS idx_users_provider     ON public.users (provider, provider_id);
CREATE INDEX IF NOT EXISTS idx_users_status       ON public.users (status);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at   ON public.users (deleted_at);

-- ── auth_sessions ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.auth_sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  refresh_token_hash  TEXT NOT NULL,
  user_agent          TEXT,
  ip_address          INET,
  expires_at          TIMESTAMPTZ NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at          TIMESTAMPTZ,

  CONSTRAINT auth_sessions_token_hash_unique UNIQUE (refresh_token_hash)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id     ON public.auth_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash  ON public.auth_sessions (refresh_token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_active       ON public.auth_sessions (revoked_at, expires_at);

-- ── password_reset_tokens ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reset_token_hash  TEXT NOT NULL,
  reset_email       VARCHAR(255) NOT NULL,
  reset_attempts    INTEGER NOT NULL DEFAULT 0,
  expires_at        TIMESTAMPTZ NOT NULL,
  used_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reset_token_hash  ON public.password_reset_tokens (reset_token_hash);
CREATE INDEX IF NOT EXISTS idx_reset_user_id     ON public.password_reset_tokens (user_id, used_at);

-- ── audit_logs ─────────────────────────────────────────────────────────────
-- user_id is intentionally NOT a FK — logs must persist after user deletion
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID,
  action      VARCHAR(100) NOT NULL,
  ip_address  INET,
  user_agent  TEXT,
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_user_id    ON public.audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action     ON public.audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON public.audit_logs (created_at DESC);

-- ── updated_at auto-trigger ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_users_updated_at ON public.users;
CREATE TRIGGER set_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- RPC FUNCTIONS
-- Called from the repository layer for atomic operations that would
-- require a transaction if done as separate API calls.
-- ════════════════════════════════════════════════════════════════════════════

-- ── increment_token_version ────────────────────────────────────────────────
-- Atomically increments token_version and returns the new value.
-- Invalidates all existing JWTs for this user on next auth check.
CREATE OR REPLACE FUNCTION public.increment_token_version(user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  new_version INTEGER;
BEGIN
  UPDATE public.users
  SET token_version = token_version + 1,
      updated_at    = NOW()
  WHERE id = user_id
  RETURNING token_version INTO new_version;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', user_id;
  END IF;

  RETURN new_version;
END;
$$;

-- ── increment_failed_login_attempts ────────────────────────────────────────
-- Atomically increments failed_login_attempts.
-- Separate from the update path to avoid read-modify-write races.
CREATE OR REPLACE FUNCTION public.increment_failed_login_attempts(user_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.users
  SET failed_login_attempts = failed_login_attempts + 1,
      updated_at            = NOW()
  WHERE id = user_id;
END;
$$;

-- ── increment_reset_attempts ───────────────────────────────────────────────
-- Atomically increments reset_attempts on a password_reset_token row.
CREATE OR REPLACE FUNCTION public.increment_reset_attempts(token_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.password_reset_tokens
  SET reset_attempts = reset_attempts + 1
  WHERE id = token_id;
END;
$$;

-- ── rotate_session ─────────────────────────────────────────────────────────
-- Atomically revokes the old session and inserts a new one.
-- Returns the new session row.
-- This is the critical function that prevents token replay races.
CREATE OR REPLACE FUNCTION public.rotate_session(
  p_old_session_id  UUID,
  p_user_id         UUID,
  p_new_token_hash  TEXT,
  p_user_agent      TEXT,
  p_ip_address      TEXT,
  p_expires_at      TIMESTAMPTZ
)
RETURNS SETOF public.auth_sessions
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  new_session_id UUID := gen_random_uuid();
BEGIN
  -- Revoke old session
  UPDATE public.auth_sessions
  SET revoked_at = NOW()
  WHERE id = p_old_session_id
    AND revoked_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found or already revoked: %', p_old_session_id;
  END IF;

  -- Insert new session
  INSERT INTO public.auth_sessions (
    id, user_id, refresh_token_hash,
    user_agent, ip_address, expires_at, last_used_at
  ) VALUES (
    new_session_id, p_user_id, p_new_token_hash,
    p_user_agent, p_ip_address::INET, p_expires_at, NOW()
  );

  -- Return the new session row
  RETURN QUERY
    SELECT * FROM public.auth_sessions WHERE id = new_session_id;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (defence-in-depth)
-- Our service role key bypasses RLS, so these policies only protect
-- against accidental direct table access via the anon/authenticated role.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs          ENABLE ROW LEVEL SECURITY;

-- Deny all access from anon/authenticated roles (service role bypasses this)
CREATE POLICY "deny_all_users"                ON public.users                USING (FALSE);
CREATE POLICY "deny_all_sessions"             ON public.auth_sessions         USING (FALSE);
CREATE POLICY "deny_all_reset_tokens"         ON public.password_reset_tokens USING (FALSE);
CREATE POLICY "deny_all_audit_logs"           ON public.audit_logs            USING (FALSE);
