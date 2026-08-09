-- ─────────────────────────────────────────────────────────────────────────
-- Profile customization support. profiles already has website_url; adds
-- the remaining social links used by the profile-editing UI, plus a
-- background/cover image which the profile schema never had a column for
-- at all.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS background_url TEXT,
  ADD COLUMN IF NOT EXISTS behance_url    TEXT,
  ADD COLUMN IF NOT EXISTS pinterest_url  TEXT,
  ADD COLUMN IF NOT EXISTS twitter_url    TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_url   TEXT;

COMMENT ON COLUMN public.profiles.background_url IS 'Cover/banner image shown behind the profile header.';
