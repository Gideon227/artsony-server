-- ─────────────────────────────────────────────────────────────────────────
-- Auto-detected location (sign-up / login).
--
-- profiles.country / state / city are the PUBLIC location a user picks in
-- Settings, and they drive the location filters. Auto-detection must not
-- clobber a location the user chose, so we track who set it:
--
--   location_source = 'user'  → the user set (or cleared) it; never auto-updated
--   location_source = 'ip'    → auto-filled from their connection; refreshed on login
--   location_source IS NULL   → nothing set yet
--
-- detected_* is a separate, PRIVATE reading of where the latest sign-up /
-- login came from. It is refreshed every time and is never selected by the
-- profile API (findByIdWithProfile lists its columns explicitly).
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS location_source  TEXT,
  ADD COLUMN IF NOT EXISTS detected_country TEXT,
  ADD COLUMN IF NOT EXISTS detected_state   TEXT,
  ADD COLUMN IF NOT EXISTS detected_city    TEXT,
  ADD COLUMN IF NOT EXISTS detected_at      TIMESTAMPTZ;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_location_source_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_location_source_check
  CHECK (location_source IS NULL OR location_source IN ('ip', 'user'));

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_detected_country_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_detected_country_check
  CHECK (detected_country IS NULL OR detected_country ~ '^[A-Z]{2}$');

-- Everything saved before this migration was typed in by the user, so it must
-- be protected from the first auto-detection run.
UPDATE public.profiles
   SET location_source = 'user'
 WHERE location_source IS NULL
   AND (country IS NOT NULL OR state IS NOT NULL OR city IS NOT NULL);

-- Useful later for "available in your region" checks and regional analytics.
CREATE INDEX IF NOT EXISTS idx_profiles_detected_country
  ON public.profiles (detected_country)
  WHERE detected_country IS NOT NULL;