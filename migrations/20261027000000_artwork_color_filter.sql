-- =============================================================================
-- Color filter (search page)
-- =============================================================================
-- Mirrors get_artwork_ids_by_size(): variants is a JSONB array of dimensions,
-- each with an options array, so "does this artwork offer a color like X" needs
-- a JSONB query. Labels are free text typed by the seller ("Red", "Crimson red"),
-- so match case-insensitively against LIKE patterns supplied by the API
-- (already wrapped in % and escaped).

CREATE OR REPLACE FUNCTION public.get_artwork_ids_by_color(p_patterns TEXT[])
RETURNS TABLE (id UUID) AS $$
  SELECT a.id
  FROM public.artworks a
  WHERE a.visibility = 'PUBLIC'
    AND a.status = 'PUBLISHED'
    AND a.deleted_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(a.variants) AS dim
      CROSS JOIN jsonb_array_elements(dim -> 'options') AS opt
      WHERE dim ->> 'type' = 'COLOR'
        AND opt ->> 'label' ILIKE ANY (p_patterns)
    );
$$ LANGUAGE sql STABLE;