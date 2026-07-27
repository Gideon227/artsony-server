-- =============================================================================
-- Fix duplicate get_top_picks overload
--
-- 20241101000000_top_picks_and_size_filter.sql created:
--   get_top_picks(p_limit INTEGER DEFAULT 8)
-- 20241102000000_shop_top_picks_and_locations.sql created:
--   get_top_picks(p_limit INTEGER DEFAULT 8, p_listing_type TEXT DEFAULT NULL)
--
-- Postgres treats these as two distinct overloaded functions (CREATE OR
-- REPLACE only replaces a function with the exact same argument signature —
-- it does not collapse or supersede a different signature). Any 1-arg call
-- site (e.g. supabase.rpc('get_top_picks', { p_limit: 8 })) is now ambiguous
-- between the two overloads and will raise a
-- "function is not unique" (42725) error at call time.
--
-- Fix: drop the old 1-arg version. The 2-arg version's p_listing_type
-- defaults to NULL, so it already fully covers every existing 1-arg call
-- site with identical behavior — nothing else needs to change.
-- =============================================================================

DROP FUNCTION IF EXISTS public.get_top_picks(INTEGER);

-- Sanity check after running: this should list exactly ONE get_top_picks.
--   SELECT proname, pg_get_function_identity_arguments(oid)
--   FROM pg_proc
--   WHERE proname = 'get_top_picks';