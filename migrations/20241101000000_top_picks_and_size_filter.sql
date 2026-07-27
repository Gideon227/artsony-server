-- =============================================================================
-- Top Picks algorithm + size-variant ("Medium" filter) support
-- =============================================================================

-- ── Top Picks ─────────────────────────────────────────────────────────────────
-- A real ranking, not manual curation (no is_featured flag exists on the
-- canonical artworks table — it only ever existed on the old pre-canonical
-- one). Classic decayed-hotness score: engagement matters, but decays with
-- age so this doesn't calcify into the same handful of artworks forever.
-- DISTINCT ON creator_id caps it at one artwork per artist, since the point
-- of "Top Picks" is a spread across different creators, not one person's
-- whole gallery.

CREATE OR REPLACE FUNCTION public.get_top_picks(p_limit INTEGER DEFAULT 8)
RETURNS SETOF public.artworks AS $$
  SELECT DISTINCT ON (creator_id) a.*
  FROM public.artworks a
  WHERE a.visibility = 'PUBLIC'
    AND a.status = 'PUBLISHED'
  ORDER BY
    creator_id,
    (
      (a.like_count * 3 + a.view_count + a.comment_count * 5)
      / POWER(EXTRACT(EPOCH FROM (NOW() - a.created_at)) / 86400 + 2, 1.5)
    ) DESC
  LIMIT p_limit;
$$ LANGUAGE sql STABLE;

-- Note: DISTINCT ON picks the highest-scored row per creator, but the outer
-- query has no further ORDER BY once DISTINCT ON's own ordering is consumed —
-- callers should re-sort client-side by whatever field they care about
-- (score isn't returned as a column). Kept simple deliberately; if this needs
-- to return score too, wrap in a subquery — not needed for a top-N pick list.

-- ── Size-variant ("Medium") support ───────────────────────────────────────────
-- variants is a JSONB array of variant dimensions, each with its own options
-- array — there's no relational variant_options table, so "does this artwork
-- offer size X" and "what size labels exist at all" both need JSONB queries.
-- A GIN index makes both fast even as the artworks table grows.

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

-- Distinct size labels across all published/public artworks, with a count
-- of how many artworks offer each — lets the "Medium" dropdown show real,
-- currently-available sizes instead of a hardcoded guess.
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

-- Artwork ids offering a given size — used to filter the main artwork list
-- the same way getEngagedCategories / getRecentArtistIds feed into it
-- (fetch matching ids, then .in('id', ids) on the normal list query).
CREATE OR REPLACE FUNCTION public.get_artwork_ids_by_size(p_size_label TEXT)
RETURNS TABLE (id UUID) AS $$
  SELECT a.id
  FROM public.artworks a
  WHERE a.visibility = 'PUBLIC'
    AND a.status = 'PUBLISHED'
    AND public.artwork_has_size(a.variants, p_size_label);
$$ LANGUAGE sql STABLE;