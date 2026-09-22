-- =============================================================================
-- Fix: "column reference "like_count" is ambiguous" in toggle_artwork_like
--
-- RETURNS TABLE (liked BOOLEAN, like_count INTEGER) implicitly declares
-- `like_count` as a PL/pgSQL OUT variable for the whole function body. Every
-- unqualified `like_count` inside the UPDATE public.artworks statements was
-- ambiguous between that OUT variable and the artworks.like_count column —
-- Postgres errors on this by default (#variable_conflict is 'error').
-- Fix: qualify every table-column reference with the table name.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.toggle_artwork_like(
  p_artwork_id UUID,
  p_user_id    UUID
)
RETURNS TABLE (liked BOOLEAN, like_count INTEGER)
LANGUAGE plpgsql AS $$
DECLARE
  v_deleted INTEGER;
  v_count   INTEGER;
BEGIN
  DELETE FROM public.artwork_likes
  WHERE artwork_id = p_artwork_id AND user_id = p_user_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted > 0 THEN
    UPDATE public.artworks
    SET like_count = GREATEST(public.artworks.like_count - 1, 0)
    WHERE id = p_artwork_id
    RETURNING public.artworks.like_count INTO v_count;

    INSERT INTO public.artwork_engagement_daily (artwork_id, day, like_count)
    VALUES (p_artwork_id, CURRENT_DATE, -1)
    ON CONFLICT (artwork_id, day)
    DO UPDATE SET like_count = GREATEST(public.artwork_engagement_daily.like_count - 1, 0);

    RETURN QUERY SELECT FALSE, v_count;
  ELSE
    INSERT INTO public.artwork_likes (artwork_id, user_id)
    VALUES (p_artwork_id, p_user_id);

    UPDATE public.artworks
    SET like_count = public.artworks.like_count + 1
    WHERE id = p_artwork_id
    RETURNING public.artworks.like_count INTO v_count;

    INSERT INTO public.artwork_engagement_daily (artwork_id, day, like_count)
    VALUES (p_artwork_id, CURRENT_DATE, 1)
    ON CONFLICT (artwork_id, day)
    DO UPDATE SET like_count = public.artwork_engagement_daily.like_count + 1;

    RETURN QUERY SELECT TRUE, v_count;
  END IF;
END;
$$;
