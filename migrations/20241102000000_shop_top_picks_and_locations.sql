-- 1. Add the useful index Claude suggested
CREATE INDEX IF NOT EXISTS idx_profiles_location ON public.profiles (location) WHERE location IS NOT NULL;

-- 2. Update get_top_picks to include p_listing_type (from Claude)
CREATE OR REPLACE FUNCTION public.get_top_picks(p_limit INTEGER DEFAULT 8, p_listing_type TEXT DEFAULT NULL)
RETURNS SETOF public.artworks AS $$
  SELECT DISTINCT ON (creator_id) a.*
  FROM public.artworks a
  WHERE a.visibility = 'PUBLIC'
    AND a.status = 'PUBLISHED'
    AND (p_listing_type IS NULL OR a.listing_type = p_listing_type)
  ORDER BY
    creator_id,
    (
      (a.like_count * 3 + a.view_count + a.comment_count * 5)
      / POWER(EXTRACT(EPOCH FROM (NOW() - a.created_at)) / 86400 + 2, 1.5)
    ) DESC
  LIMIT p_limit;
$$ LANGUAGE sql STABLE;

-- 3. Re-affirm your updated locations function (Your code, unchanged)
CREATE OR REPLACE FUNCTION get_distinct_artist_locations()
RETURNS TABLE(label TEXT, artwork_count BIGINT)
LANGUAGE sql STABLE AS $$
  SELECT p.location AS label, COUNT(DISTINCT a.id) AS artwork_count
  FROM profiles p
  JOIN artworks a ON a.creator_id = p.user_id
  WHERE p.location IS NOT NULL
    AND p.location <> ''
    AND a.status = 'PUBLISHED'
    AND a.visibility = 'PUBLIC'
    AND a.deleted_at IS NULL
  GROUP BY p.location
  ORDER BY artwork_count DESC, label ASC
  LIMIT 200;
$$;