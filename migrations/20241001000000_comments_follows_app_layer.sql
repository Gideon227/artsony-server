-- =============================================================================
-- Comments + Follows application-layer support
--
-- The `comments` and `follows` tables already exist (001_initial_schema.sql),
-- fully designed with nested replies, soft-delete, and no-self-follow — but
-- there was never any application code built on top of them.
--
-- One real bug fixed here: 003_triggers.sql already ships a comment-count
-- trigger, but it targets `artworks.comments_count` (plural) — a column that
-- only ever existed on the OLD pre-canonical artworks table. The canonical
-- schema (20240201000000_artwork_schema.sql) uses `comment_count` (singular)
-- and has no trigger maintaining it at all. This migration adds the correct
-- one, aware of soft-delete (deleted_at) unlike the old version.
-- =============================================================================

-- ── comment_count on the canonical artworks table ───────────────────────────

CREATE OR REPLACE FUNCTION public.handle_comment_count_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.deleted_at IS NULL THEN
      UPDATE public.artworks SET comment_count = comment_count + 1 WHERE id = NEW.artwork_id;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Soft-delete: comment goes from visible -> deleted
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      UPDATE public.artworks SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = NEW.artwork_id;
    -- Restore: comment goes from deleted -> visible
    ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
      UPDATE public.artworks SET comment_count = comment_count + 1 WHERE id = NEW.artwork_id;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.deleted_at IS NULL THEN
      UPDATE public.artworks SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.artwork_id;
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_comment_count_insert ON public.comments;
CREATE TRIGGER trg_comment_count_insert
  AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.handle_comment_count_change();

DROP TRIGGER IF EXISTS trg_comment_count_update ON public.comments;
CREATE TRIGGER trg_comment_count_update
  AFTER UPDATE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.handle_comment_count_change();

DROP TRIGGER IF EXISTS trg_comment_count_delete ON public.comments;
CREATE TRIGGER trg_comment_count_delete
  AFTER DELETE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.handle_comment_count_change();

-- ── reply_count on comments (avoids N+1 / GROUP BY at read time) ────────────

ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS reply_count INTEGER NOT NULL DEFAULT 0 CHECK (reply_count >= 0);

CREATE OR REPLACE FUNCTION public.handle_reply_count_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.parent_id IS NOT NULL AND NEW.deleted_at IS NULL THEN
      UPDATE public.comments SET reply_count = reply_count + 1 WHERE id = NEW.parent_id;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.parent_id IS NOT NULL THEN
      IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
        UPDATE public.comments SET reply_count = GREATEST(reply_count - 1, 0) WHERE id = NEW.parent_id;
      ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
        UPDATE public.comments SET reply_count = reply_count + 1 WHERE id = NEW.parent_id;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.parent_id IS NOT NULL AND OLD.deleted_at IS NULL THEN
      UPDATE public.comments SET reply_count = GREATEST(reply_count - 1, 0) WHERE id = OLD.parent_id;
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reply_count_insert ON public.comments;
CREATE TRIGGER trg_reply_count_insert
  AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.handle_reply_count_change();

DROP TRIGGER IF EXISTS trg_reply_count_update ON public.comments;
CREATE TRIGGER trg_reply_count_update
  AFTER UPDATE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.handle_reply_count_change();

DROP TRIGGER IF EXISTS trg_reply_count_delete ON public.comments;
CREATE TRIGGER trg_reply_count_delete
  AFTER DELETE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.handle_reply_count_change();

-- ── Indexes for comment listing ──────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_comments_artwork_top_level
  ON public.comments (artwork_id, created_at DESC)
  WHERE parent_id IS NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_comments_parent
  ON public.comments (parent_id, created_at ASC)
  WHERE deleted_at IS NULL;

-- ── Atomic follow toggle ──────────────────────────────────────────────────────
-- Mirrors the existing toggle_artwork_like RPC pattern: one round trip,
-- profiles.followers_count/following_count stay correct via the existing
-- 003_triggers.sql follow triggers (those target `profiles`, which was never
-- redefined elsewhere, so — unlike the comment trigger — they're already
-- correct and untouched here).

CREATE OR REPLACE FUNCTION public.toggle_follow(
  p_follower_id UUID,
  p_following_id UUID
)
RETURNS TABLE (is_following BOOLEAN) AS $$
DECLARE
  v_existing UUID;
BEGIN
  IF p_follower_id = p_following_id THEN
    RAISE EXCEPTION 'Cannot follow yourself';
  END IF;

  SELECT id INTO v_existing
  FROM public.follows
  WHERE follower_id = p_follower_id AND following_id = p_following_id;

  IF v_existing IS NOT NULL THEN
    DELETE FROM public.follows WHERE id = v_existing;
    RETURN QUERY SELECT FALSE;
  ELSE
    INSERT INTO public.follows (follower_id, following_id)
    VALUES (p_follower_id, p_following_id);
    RETURN QUERY SELECT TRUE;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE INDEX IF NOT EXISTS idx_follows_follower ON public.follows (follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON public.follows (following_id);