-- ═══════════════════════════════════════════════════════════════════════════
-- Artsony — Seller Registration Schema
-- Run via: supabase db push  OR  paste into Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Enums ─────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE seller_registration_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Marketplace artworks belonging to a seller who is suspended or rejected
-- after having been approved are moved to PAUSED — hidden from public
-- discovery/purchase but preserving likes/comments/saves and all engagement
-- data. Restored to PUBLISHED automatically on reactivation.
ALTER TYPE artwork_status ADD VALUE IF NOT EXISTS 'PAUSED';

-- ── seller_registrations ────────────────────────────────────────────────────
-- One row per user (hard UNIQUE(user_id)) whose status transitions over time.
-- This single constraint is what prevents duplicate pending/approved/any
-- registrations — there is never more than one row to be duplicate of.

CREATE TABLE IF NOT EXISTS public.seller_registrations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  full_name     TEXT NOT NULL CHECK (char_length(full_name) BETWEEN 1 AND 150),
  username      TEXT NOT NULL CHECK (char_length(username) BETWEEN 3 AND 30),
  email         TEXT NOT NULL,
  phone_number  TEXT NOT NULL,
  address       TEXT NOT NULL CHECK (char_length(address) BETWEEN 1 AND 300),
  state         TEXT NOT NULL,
  country       CHAR(2) NOT NULL,           -- ISO 3166-1 alpha-2, matches shipping_addresses.country_code
  postal_code   TEXT,

  status        seller_registration_status NOT NULL DEFAULT 'PENDING',
  reviewed_by   UUID REFERENCES public.users(id) ON DELETE SET NULL,
  review_notes  TEXT,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT seller_registrations_user_id_unique UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_seller_registrations_status      ON public.seller_registrations (status);
CREATE INDEX IF NOT EXISTS idx_seller_registrations_reviewed_by ON public.seller_registrations (reviewed_by) WHERE reviewed_by IS NOT NULL;

-- ── updated_at trigger ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_seller_registrations_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_seller_registrations_updated_at ON public.seller_registrations;
CREATE TRIGGER set_seller_registrations_updated_at
  BEFORE UPDATE ON public.seller_registrations
  FOR EACH ROW EXECUTE FUNCTION public.set_seller_registrations_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- RPC FUNCTIONS
-- Both functions below are called from the repository layer for atomic
-- multi-effect operations that would otherwise require a client-side
-- transaction (which the Supabase JS/PostgREST client does not support).
-- ════════════════════════════════════════════════════════════════════════════

-- ── submit_seller_registration ──────────────────────────────────────────────
-- Atomically inserts a new registration, or — if the user's existing row is
-- REJECTED — resubmits by updating that same row back to PENDING (clearing
-- any prior admin review). If a row exists in any other status, raises a
-- unique_violation (23505) so the JS layer can translate it into a 409
-- Conflict using the same error-code convention already used elsewhere in
-- this codebase (see artwork.repository.generateSlug).
--
-- SELECT ... FOR UPDATE locks the row for the duration of the transaction,
-- so two concurrent resubmission attempts cannot both succeed.

CREATE OR REPLACE FUNCTION public.submit_seller_registration(
  p_user_id      UUID,
  p_full_name    TEXT,
  p_username     TEXT,
  p_email        TEXT,
  p_phone_number TEXT,
  p_address      TEXT,
  p_state        TEXT,
  p_country      TEXT,
  p_postal_code  TEXT DEFAULT NULL
)
RETURNS SETOF public.seller_registrations
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  existing public.seller_registrations%ROWTYPE;
BEGIN
  SELECT * INTO existing
  FROM public.seller_registrations
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY
      INSERT INTO public.seller_registrations (
        user_id, full_name, username, email, phone_number,
        address, state, country, postal_code, status
      ) VALUES (
        p_user_id, p_full_name, p_username, p_email, p_phone_number,
        p_address, p_state, p_country, p_postal_code, 'PENDING'
      )
      RETURNING *;
    RETURN;
  END IF;

  IF existing.status <> 'REJECTED' THEN
    RAISE EXCEPTION 'A seller registration already exists with status %', existing.status
      USING ERRCODE = '23505';
  END IF;

  RETURN QUERY
    UPDATE public.seller_registrations
    SET full_name    = p_full_name,
        username     = p_username,
        email        = p_email,
        phone_number = p_phone_number,
        address      = p_address,
        state        = p_state,
        country      = p_country,
        postal_code  = p_postal_code,
        status       = 'PENDING',
        reviewed_by  = NULL,
        review_notes = NULL,
        updated_at   = NOW()
    WHERE id = existing.id
    RETURNING *;
END;
$$;

-- ── transition_seller_registration ──────────────────────────────────────────
-- Single entry point for all four admin actions (approve / reject / suspend /
-- reactivate — "reactivate" is simply APPROVED called from status SUSPENDED).
-- The legal-transition table below is the authoritative, race-safe copy of
-- SELLER_REGISTRATION_TRANSITIONS in src/common/types/seller.types.ts — the
-- service layer checks it first for a fast, friendly error, and this check
-- is the guaranteed-consistent fallback for concurrent admin actions.
--
-- On APPROVED: promotes users.role to ARTIST. If coming from SUSPENDED
-- (reactivation), restores that seller's PAUSED MARKETPLACE artworks back to
-- PUBLISHED.
-- On SUSPENDED: demotes users.role back to USER, and pauses that seller's
-- PUBLISHED MARKETPLACE artworks (preserving likes/comments/saves — only the
-- status column changes, so already-existing engagement data is untouched).
-- On REJECTED: no role/artwork change — from PENDING the user was never
-- promoted; from SUSPENDED, role is already USER and artworks already PAUSED.
--
-- Every role-changing transition also bumps users.token_version, forcing the
-- user's existing access tokens to be refreshed on their next request so the
-- corrected role claim takes effect immediately rather than waiting out the
-- access token TTL (mirrors the existing increment_token_version pattern
-- used on password reset / account deletion).

CREATE OR REPLACE FUNCTION public.transition_seller_registration(
  p_registration_id UUID,
  p_new_status      seller_registration_status,
  p_admin_id        UUID,
  p_notes           TEXT DEFAULT NULL
)
RETURNS SETOF public.seller_registrations
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  reg         public.seller_registrations%ROWTYPE;
  is_legal    BOOLEAN;
BEGIN
  SELECT * INTO reg
  FROM public.seller_registrations
  WHERE id = p_registration_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Seller registration not found: %', p_registration_id;
  END IF;

  is_legal := (reg.status = 'PENDING'   AND p_new_status IN ('APPROVED', 'REJECTED'))
           OR (reg.status = 'APPROVED'  AND p_new_status = 'SUSPENDED')
           OR (reg.status = 'SUSPENDED' AND p_new_status IN ('APPROVED', 'REJECTED'));

  IF NOT is_legal THEN
    RAISE EXCEPTION 'Cannot transition seller registration from % to %', reg.status, p_new_status;
  END IF;

  UPDATE public.seller_registrations
  SET status       = p_new_status,
      reviewed_by  = p_admin_id,
      review_notes = p_notes,
      updated_at   = NOW()
  WHERE id = p_registration_id;

  IF p_new_status = 'APPROVED' THEN
    UPDATE public.users
    SET role = 'ARTIST', token_version = token_version + 1, updated_at = NOW()
    WHERE id = reg.user_id;

    IF reg.status = 'SUSPENDED' THEN
      UPDATE public.artworks
      SET status = 'PUBLISHED', updated_at = NOW()
      WHERE creator_id = reg.user_id
        AND listing_type = 'MARKETPLACE'
        AND status = 'PAUSED'
        AND deleted_at IS NULL;
    END IF;

  ELSIF p_new_status = 'SUSPENDED' THEN
    UPDATE public.users
    SET role = 'USER', token_version = token_version + 1, updated_at = NOW()
    WHERE id = reg.user_id;

    UPDATE public.artworks
    SET status = 'PAUSED', updated_at = NOW()
    WHERE creator_id = reg.user_id
      AND listing_type = 'MARKETPLACE'
      AND status = 'PUBLISHED'
      AND deleted_at IS NULL;
  END IF;

  RETURN QUERY SELECT * FROM public.seller_registrations WHERE id = p_registration_id;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (defence-in-depth — service role key bypasses RLS)
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.seller_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_all_seller_registrations" ON public.seller_registrations USING (FALSE);
