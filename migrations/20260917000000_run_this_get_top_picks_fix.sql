-- =============================================================================
-- get_top_picks fix — corrected version (v2)
--
-- v1 of this file failed on "column \"location\" does not exist" — see the
-- CHANGES.md note for that; fixed by dropping the two profiles.location
-- statements entirely (obsolete, already superseded by
-- 20241206000000_country_state_city.sql).
--
-- v2 fix: "operator does not exist: listing_type = text". a.listing_type is
-- a native Postgres enum, not TEXT — comparing it straight to the p_listing_type
-- TEXT parameter has no matching operator (a literal like 'PUBLISHED' auto-
-- coerces fine; a declared TEXT parameter doesn't). Cast the column to TEXT
-- for the comparison. This bug was already in the original
-- 20241102000000_shop_top_picks_and_locations.sql migration's version of
-- this function, not something the simplification introduced — it just
-- never got far enough to hit it until now, which also confirms this
-- function has never successfully existed on the live DB in any form.
-- =============================================================================

-- ── Top Picks ─────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_top_picks(INTEGER);

CREATE OR REPLACE FUNCTION public.get_top_picks(p_limit INTEGER DEFAULT 8, p_listing_type TEXT DEFAULT NULL)
RETURNS SETOF public.artworks AS $$
  SELECT DISTINCT ON (creator_id) a.*
  FROM public.artworks a
  WHERE a.visibility = 'PUBLIC'
    AND a.status = 'PUBLISHED'
    AND (p_listing_type IS NULL OR a.listing_type::TEXT = p_listing_type)
  ORDER BY
    creator_id,
    (
      (a.like_count * 3 + a.view_count + a.comment_count * 5)
      / POWER(EXTRACT(EPOCH FROM (NOW() - a.created_at)) / 86400 + 2, 1.5)
    ) DESC
  LIMIT p_limit;
$$ LANGUAGE sql STABLE;

-- ── Size-variant ("Medium" filter) support — unrelated to the failure above,
-- kept since it was in the same original migration and doesn't touch
-- profiles.location at all.
CREATE INDEX IF NOT EXISTS idx_artworks_variants_gin
  ON public.artworks USING GIN (variants);

CREATE OR REPLACE FUNCTION public.artwork_has_size(p_variants JSONB, p_size_label TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_variants) AS dim
    CROSS JOIN jsonb_array_elements(dim -> 'options') AS opt
    WHERE dim ->> 'type' = 'SIZE'
      AND opt ->> 'label' = p_size_label
  );
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.get_distinct_size_labels()
RETURNS TABLE (label TEXT, artwork_count BIGINT) AS $$
  SELECT opt ->> 'label' AS label, COUNT(DISTINCT a.id) AS artwork_count
  FROM public.artworks a
  CROSS JOIN LATERAL jsonb_array_elements(a.variants) AS dim
  CROSS JOIN LATERAL jsonb_array_elements(dim -> 'options') AS opt
  WHERE a.visibility = 'PUBLIC'
    AND a.status = 'PUBLISHED'
    AND dim ->> 'type' = 'SIZE'
  GROUP BY opt ->> 'label'
  ORDER BY artwork_count DESC;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION public.get_artwork_ids_by_size(p_size_label TEXT)
RETURNS TABLE (id UUID) AS $$
  SELECT a.id
  FROM public.artworks a
  WHERE a.visibility = 'PUBLIC'
    AND a.status = 'PUBLISHED'
    AND public.artwork_has_size(a.variants, p_size_label);
$$ LANGUAGE sql STABLE;