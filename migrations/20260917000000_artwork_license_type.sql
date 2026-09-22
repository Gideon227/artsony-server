-- =============================================================================
-- artworks.license_type — persists the artist's chosen reuse license.
--
-- The upload wizard (upload-step-two.tsx) has offered a 4-option Creative
-- Commons dropdown since before this migration, but the selection was only
-- ever held in the client-side draft store — CreateArtworkPayload never
-- declared the field, so preparePayload() silently dropped it before the
-- artwork.create/update API call, and nothing persisted it. This adds the
-- column those 4 existing option ids (attribution / attribution-sharealike /
-- attribution-derivs / attribution-non-commercial) map onto directly, so no
-- separate code<->DB translation table is needed. NULL = "All rights
-- reserved", the dropdown's existing implicit default when nothing is
-- selected.
--
-- Plain TEXT + CHECK rather than a native ENUM type: the four values are
-- product copy that may grow (e.g. adding CC0 / CC BY-NC-SA later), and a
-- CHECK constraint is a one-line ALTER to extend — no ALTER TYPE dance.
--
-- Run this directly via the Supabase SQL editor or `supabase db push` —
-- migrations/run.ts currently can't run it (imports a `supabaseAdmin` export
-- that doesn't exist in src/config/supabase.ts, and calls an `exec_sql` RPC
-- no migration defines). Separate, pre-existing issue, not addressed here.
-- =============================================================================

ALTER TABLE public.artworks
  ADD COLUMN IF NOT EXISTS license_type TEXT;

ALTER TABLE public.artworks
  DROP CONSTRAINT IF EXISTS artworks_license_type_check;

ALTER TABLE public.artworks
  ADD CONSTRAINT artworks_license_type_check
  CHECK (license_type IS NULL OR license_type IN (
    'attribution',
    'attribution-sharealike',
    'attribution-derivs',
    'attribution-non-commercial'
  ));