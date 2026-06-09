-- ═══════════════════════════════════════════════════════════════════════════
-- Artsony — Artwork Schema
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- ── Enums ──────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE listing_type AS ENUM ('MARKETPLACE', 'PORTFOLIO');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE artwork_format AS ENUM ('DIGITAL', 'PHYSICAL');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE artwork_media_type AS ENUM ('IMAGE', 'VIDEO', 'THREE_D', 'EXTERNAL_LINK');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE artwork_visibility AS ENUM ('PUBLIC', 'PRIVATE', 'UNLISTED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE artwork_status AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED', 'UNDER_REVIEW');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE moderation_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'FLAGGED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ── artworks ───────────────────────────────────────────────────────────────
--
-- Design decisions:
--   • assets, variants, physical_details, marketplace_details stored as JSONB
--     — avoids 6 join tables for highly variable nested structures, while
--     keeping tsvector search on scalar columns for query performance.
--   • slug is unique + indexed for O(1) public URL lookup.
--   • search_vector is a generated tsvector updated by trigger — never
--     computed at query time.
--   • collaborator_ids is a UUID[] column — fast GIN containment queries
--     without an association table (acceptable for ≤ 20 collaborators).

CREATE TABLE IF NOT EXISTS public.artworks (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core classification
  listing_type          listing_type    NOT NULL DEFAULT 'PORTFOLIO',
  artwork_format        artwork_format  NOT NULL DEFAULT 'DIGITAL',

  -- Identity
  title                 VARCHAR(300)    NOT NULL CHECK (char_length(title) BETWEEN 1 AND 300),
  description           TEXT            NOT NULL CHECK (char_length(description) <= 10000),
  slug                  VARCHAR(350)    NOT NULL UNIQUE,

  -- Discovery
  categories            TEXT[]          NOT NULL DEFAULT '{}',
  keywords              TEXT[]          NOT NULL DEFAULT '{}',

  -- Ownership
  creator_id            UUID            NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  collaborator_ids      UUID[]          NOT NULL DEFAULT '{}',

  -- Creative metadata
  tools_used            TEXT[]          NOT NULL DEFAULT '{}',

  -- Assets (array of asset objects, stored as JSONB)
  -- Each element: { id, original_url, optimized_url, thumbnail_url,
  --                 media_type, width, height, duration_secs, mime_type,
  --                 file_size_bytes, ordering_index }
  assets                JSONB           NOT NULL DEFAULT '[]'::JSONB,

  -- Engagement controls
  visibility            artwork_visibility NOT NULL DEFAULT 'PUBLIC',
  allow_moodboard_save  BOOLEAN         NOT NULL DEFAULT TRUE,
  allow_comments        BOOLEAN         NOT NULL DEFAULT TRUE,
  allow_likes           BOOLEAN         NOT NULL DEFAULT TRUE,
  show_engagement_stats BOOLEAN         NOT NULL DEFAULT TRUE,

  -- Status & moderation
  status                artwork_status  NOT NULL DEFAULT 'DRAFT',
  is_flagged            BOOLEAN         NOT NULL DEFAULT FALSE,
  moderation_status     moderation_status NOT NULL DEFAULT 'PENDING',
  reviewed_by           UUID            REFERENCES public.users(id) ON DELETE SET NULL,
  review_notes          TEXT,

  -- Marketplace fields (conditional: only used when listing_type = MARKETPLACE)
  price                 NUMERIC(12, 2)  CHECK (price IS NULL OR price >= 0),
  currency              VARCHAR(10)     NOT NULL DEFAULT 'USD',
  max_purchase_quantity INTEGER         CHECK (max_purchase_quantity IS NULL OR max_purchase_quantity >= 1),

  -- Physical artwork fields (conditional: only used when artwork_format = PHYSICAL)
  -- Stored as JSONB: { length, width, height, unit, available_quantity,
  --                    shipping_regions, ships_worldwide }
  physical_details      JSONB,

  -- Variants (conditional: only when has_variants = true)
  -- Stored as JSONB array: [{ id, type, name, options: [...] }]
  has_variants          BOOLEAN         NOT NULL DEFAULT FALSE,
  variants              JSONB           NOT NULL DEFAULT '[]'::JSONB,

  -- Denormalised counters (updated by triggers)
  view_count            INTEGER         NOT NULL DEFAULT 0 CHECK (view_count >= 0),
  like_count            INTEGER         NOT NULL DEFAULT 0 CHECK (like_count >= 0),
  save_count            INTEGER         NOT NULL DEFAULT 0 CHECK (save_count >= 0),
  comment_count         INTEGER         NOT NULL DEFAULT 0 CHECK (comment_count >= 0),

  -- Full-text search vector (updated by trigger)
  search_vector         TSVECTOR,

  created_at            TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ
);

-- ── Indexes ────────────────────────────────────────────────────────────────

-- Slug: primary public URL lookup — must be instant
CREATE UNIQUE INDEX IF NOT EXISTS idx_artworks_slug
  ON public.artworks (slug)
  WHERE deleted_at IS NULL;

-- Creator feed (creator profile page: newest first)
CREATE INDEX IF NOT EXISTS idx_artworks_creator_status
  ON public.artworks (creator_id, status, created_at DESC)
  WHERE deleted_at IS NULL;

-- Public discovery (status + visibility filter is the most common predicate)
CREATE INDEX IF NOT EXISTS idx_artworks_public_discovery
  ON public.artworks (visibility, status, created_at DESC)
  WHERE deleted_at IS NULL;

-- Full-text search — GIN for tsvector containment
CREATE INDEX IF NOT EXISTS idx_artworks_search_vector
  ON public.artworks USING GIN (search_vector);

-- Category filtering — GIN for array containment (@>)
CREATE INDEX IF NOT EXISTS idx_artworks_categories
  ON public.artworks USING GIN (categories);

-- Keyword filtering
CREATE INDEX IF NOT EXISTS idx_artworks_keywords
  ON public.artworks USING GIN (keywords);

-- Collaborator lookup — "show artworks I collaborated on"
CREATE INDEX IF NOT EXISTS idx_artworks_collaborators
  ON public.artworks USING GIN (collaborator_ids);

-- Trending sort (like_count DESC)
CREATE INDEX IF NOT EXISTS idx_artworks_like_count
  ON public.artworks (like_count DESC)
  WHERE deleted_at IS NULL AND status = 'PUBLISHED' AND visibility = 'PUBLIC';

-- Marketplace price range filter
CREATE INDEX IF NOT EXISTS idx_artworks_marketplace_price
  ON public.artworks (listing_type, price)
  WHERE deleted_at IS NULL AND status = 'PUBLISHED';

-- Moderation queue
CREATE INDEX IF NOT EXISTS idx_artworks_moderation
  ON public.artworks (moderation_status, created_at DESC)
  WHERE deleted_at IS NULL;

-- Soft-delete sentinel
CREATE INDEX IF NOT EXISTS idx_artworks_deleted_at
  ON public.artworks (deleted_at)
  WHERE deleted_at IS NOT NULL;

-- ── Triggers ───────────────────────────────────────────────────────────────

-- updated_at auto-maintenance
CREATE OR REPLACE FUNCTION public.set_artwork_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS artwork_updated_at ON public.artworks;
CREATE TRIGGER artwork_updated_at
  BEFORE UPDATE ON public.artworks
  FOR EACH ROW EXECUTE FUNCTION public.set_artwork_updated_at();

-- Full-text search vector maintenance
-- Weights: title (A) > categories/keywords (B) > description (C)
CREATE OR REPLACE FUNCTION public.update_artwork_search_vector()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', unaccent(coalesce(NEW.title, ''))), 'A') ||
    setweight(to_tsvector('english', unaccent(array_to_string(NEW.categories, ' '))), 'B') ||
    setweight(to_tsvector('english', unaccent(array_to_string(NEW.keywords, ' '))), 'B') ||
    setweight(to_tsvector('english', unaccent(array_to_string(NEW.tools_used, ' '))), 'C') ||
    setweight(to_tsvector('english', unaccent(coalesce(NEW.description, ''))), 'C');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS artwork_search_vector_update ON public.artworks;
CREATE TRIGGER artwork_search_vector_update
  BEFORE INSERT OR UPDATE OF title, description, categories, keywords, tools_used
  ON public.artworks
  FOR EACH ROW EXECUTE FUNCTION public.update_artwork_search_vector();

-- ── Slug generation RPC ────────────────────────────────────────────────────
-- Called from the service layer to guarantee unique slugs atomically.
CREATE OR REPLACE FUNCTION public.generate_artwork_slug(
  p_title TEXT,
  p_creator_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE
  v_base     TEXT;
  v_slug     TEXT;
  v_suffix   INT := 0;
  v_exists   BOOLEAN;
BEGIN
  -- Normalise: lowercase, replace non-alphanumeric with hyphens, collapse runs
  v_base := lower(unaccent(p_title));
  v_base := regexp_replace(v_base, '[^a-z0-9\s-]', '', 'g');
  v_base := regexp_replace(v_base, '\s+', '-', 'g');
  v_base := regexp_replace(v_base, '-+', '-', 'g');
  v_base := trim(both '-' from v_base);
  v_base := left(v_base, 200);

  v_slug := v_base;

  LOOP
    SELECT EXISTS (
      SELECT 1 FROM public.artworks WHERE slug = v_slug
    ) INTO v_exists;

    EXIT WHEN NOT v_exists;

    v_suffix := v_suffix + 1;
    v_slug   := v_base || '-' || v_suffix::TEXT;
  END LOOP;

  RETURN v_slug;
END;
$$;

-- ── View count increment RPC ───────────────────────────────────────────────
-- Atomic, avoids read-modify-write race.
CREATE OR REPLACE FUNCTION public.increment_artwork_view_count(p_artwork_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.artworks
  SET view_count = view_count + 1
  WHERE id = p_artwork_id AND deleted_at IS NULL;
END;
$$;

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.artworks ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS — these deny-all policies protect against
-- accidental direct access through the anon or authenticated JWT role.
CREATE POLICY "deny_all_artworks" ON public.artworks USING (FALSE);
