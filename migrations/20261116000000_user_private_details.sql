-- ─────────────────────────────────────────────────────────────────────────
-- Private account details: phone number + billing address.
--
-- Settings → Account Details collects a phone number and Settings → Billings
-- collects a billing address, but nothing stored either, so their Save
-- buttons had nowhere to write.
--
-- These live in their OWN table rather than on `profiles`: every column on
-- profiles is public-safe by contract (findByIdWithProfile / sanitiseUser
-- return them as-is), and a phone number or billing address must never be
-- readable by other users. This table is only ever read through the
-- authenticated /api/users/me/private-details endpoint.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_private_details (
  user_id               UUID        PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  phone_number          TEXT,
  billing_address       TEXT,
  billing_city          TEXT,
  billing_state         TEXT,
  billing_postal_code   TEXT,
  billing_country_code  CHAR(2),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.user_private_details IS
  'Private per-user contact + billing details. Created lazily on first save. Never exposed on public profile endpoints.';

DROP TRIGGER IF EXISTS set_user_private_details_updated_at ON public.user_private_details;
CREATE TRIGGER set_user_private_details_updated_at
  BEFORE UPDATE ON public.user_private_details
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.user_private_details ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_all_user_private_details" ON public.user_private_details;
CREATE POLICY "deny_all_user_private_details" ON public.user_private_details USING (FALSE);
