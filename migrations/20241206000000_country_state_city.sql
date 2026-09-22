-- ─────────────────────────────────────────────────────────────────────────
-- Replaces profiles.location (a single free-text field) with structured
-- country / state / city columns, consistent with the pattern already used
-- by shipping_addresses (country_code, state, city) and
-- seller_registrations (country, state). country is ISO 3166-1 alpha-2,
-- matching those two — state/city stay free text, same as those tables,
-- since a full state/city reference dataset isn't maintained anywhere in
-- this schema.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS state   TEXT,
  ADD COLUMN IF NOT EXISTS city    TEXT;

DROP INDEX IF EXISTS idx_profiles_location;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS location;

CREATE INDEX IF NOT EXISTS idx_profiles_country ON public.profiles (country) WHERE country IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_state   ON public.profiles (state)   WHERE state   IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_city    ON public.profiles (city)    WHERE city    IS NOT NULL;

-- Replaces the old single-field get_distinct_artist_locations(). Cascading:
-- pass p_level to pick which field to return distinct values for, and
-- p_country / p_state to scope results to a parent selection (e.g. only
-- show states that actually have artists within the selected country).
-- Old signature (no args) is dropped explicitly since return type changes.
DROP FUNCTION IF EXISTS get_distinct_artist_locations();

CREATE OR REPLACE FUNCTION get_distinct_artist_locations(
  p_level   TEXT,
  p_country TEXT DEFAULT NULL,
  p_state   TEXT DEFAULT NULL
)
RETURNS TABLE(label TEXT, artwork_count BIGINT)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  IF p_level = 'country' THEN
    RETURN QUERY
      SELECT p.country AS label, COUNT(DISTINCT a.id) AS artwork_count
      FROM profiles p
      JOIN artworks a ON a.creator_id = p.user_id
      WHERE p.country IS NOT NULL AND p.country <> ''
        AND a.status = 'PUBLISHED' AND a.visibility = 'PUBLIC' AND a.deleted_at IS NULL
      GROUP BY p.country
      ORDER BY artwork_count DESC, label ASC
      LIMIT 200;

  ELSIF p_level = 'state' THEN
    RETURN QUERY
      SELECT p.state AS label, COUNT(DISTINCT a.id) AS artwork_count
      FROM profiles p
      JOIN artworks a ON a.creator_id = p.user_id
      WHERE p.state IS NOT NULL AND p.state <> ''
        AND (p_country IS NULL OR p.country = p_country)
        AND a.status = 'PUBLISHED' AND a.visibility = 'PUBLIC' AND a.deleted_at IS NULL
      GROUP BY p.state
      ORDER BY artwork_count DESC, label ASC
      LIMIT 200;

  ELSIF p_level = 'city' THEN
    RETURN QUERY
      SELECT p.city AS label, COUNT(DISTINCT a.id) AS artwork_count
      FROM profiles p
      JOIN artworks a ON a.creator_id = p.user_id
      WHERE p.city IS NOT NULL AND p.city <> ''
        AND (p_country IS NULL OR p.country = p_country)
        AND (p_state IS NULL OR p.state = p_state)
        AND a.status = 'PUBLISHED' AND a.visibility = 'PUBLIC' AND a.deleted_at IS NULL
      GROUP BY p.city
      ORDER BY artwork_count DESC, label ASC
      LIMIT 200;

  ELSE
    RAISE EXCEPTION 'get_distinct_artist_locations: invalid p_level "%" (expected country, state, or city)', p_level;
  END IF;
END;
$$;
