-- =============================================================================
-- get_trending_artwork_ids — "trending this week regardless of upload date"
--
-- get_top_picks() (20241102000000) and getTopPicks(period='week') in
-- artwork.service.ts both score/filter by a.created_at, so an older artwork
-- that suddenly picks up likes/views this week never surfaces. This RPC
-- scores by *windowed engagement* instead, using artwork_engagement_daily
-- (20240901000000_analytics_wallet_reviews_schema.sql) — a per-artwork,
-- per-day view/like rollup already maintained by toggle_artwork_like() and
-- increment_artwork_view_count() — so an artwork's age never gates it out.
--
-- Weights mirror FEATURED_WEIGHTS in artwork.service.ts (view:1, like:3,
-- purchase:8) for consistency with the existing all-time trending score.
-- purchase_count has no daily rollup table, so it's factored in as an
-- all-time value — a coarser signal than the windowed view/like sums, but
-- purchases are rare/high-signal enough that this is an acceptable trade-off.
-- =============================================================================
-- =============================================================================
-- get_trending_artwork_ids — "trending this week regardless of upload date"
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_trending_artwork_ids(
  p_since_day    DATE,
  p_limit        INTEGER DEFAULT 8,
  p_listing_type TEXT    DEFAULT NULL
)
RETURNS TABLE (id UUID)
LANGUAGE sql STABLE AS $$
  SELECT a.id
  FROM public.artworks a
  JOIN (
    SELECT
      artwork_id,
      SUM(view_count) AS window_views,
      SUM(like_count) AS window_likes
    FROM public.artwork_engagement_daily
    WHERE day >= p_since_day
    GROUP BY artwork_id
  ) e ON e.artwork_id = a.id
  WHERE a.status = 'PUBLISHED'
    AND a.visibility = 'PUBLIC'
    AND a.deleted_at IS NULL
    AND (p_listing_type IS NULL OR a.listing_type::text = p_listing_type)
    AND (e.window_views > 0 OR e.window_likes > 0)
  ORDER BY
    (e.window_views * 1 + e.window_likes * 3 + a.purchase_count * 8) DESC
  LIMIT p_limit;
$$;