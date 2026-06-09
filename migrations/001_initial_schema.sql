-- =============================================
-- EXTENSIONS
-- =============================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- =============================================
-- ENUMS
-- Each wrapped in DO block so already-created
-- enums are silently skipped.
-- =============================================
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('user', 'admin', 'moderator');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE artwork_category AS ENUM (
    'painting', 'digital', 'photography', 'sculpture',
    'illustration', 'mixed_media', 'print', 'other'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE artwork_visibility AS ENUM ('public', 'private', 'draft');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE artwork_availability AS ENUM ('available', 'sold', 'reserved', 'not_for_sale');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- order_status and transaction_status are intentionally omitted here.
-- They are created (with uppercase values) in 20240301000000_commerce_schema.sql.
-- If this file is run before the commerce schema the enums simply won't exist
-- yet, which is correct. If the commerce schema already ran and created them,
-- we must not recreate them here.

DO $$ BEGIN
  CREATE TYPE notification_type AS ENUM (
    'like', 'comment', 'reply', 'follow', 'sale', 'order_update', 'system',
    'message', 'broadcast', 'mention'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- =============================================
-- UTILITY FUNCTIONS
-- =============================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- USERS
-- =============================================
CREATE TABLE IF NOT EXISTS public.users (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_id       UUID        UNIQUE NOT NULL,
  email         TEXT        UNIQUE NOT NULL,
  role          user_role   NOT NULL DEFAULT 'user',
  is_verified   BOOLEAN     NOT NULL DEFAULT FALSE,
  is_disabled   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

DROP TRIGGER IF EXISTS users_updated_at ON public.users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================
-- PROFILES
-- =============================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID        UNIQUE NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  username        TEXT        UNIQUE NOT NULL,
  display_name    TEXT,
  bio             TEXT        CHECK (char_length(bio) <= 500),
  avatar_url      TEXT,
  website_url     TEXT,
  location        TEXT,
  followers_count INTEGER     NOT NULL DEFAULT 0 CHECK (followers_count >= 0),
  following_count INTEGER     NOT NULL DEFAULT 0 CHECK (following_count >= 0),
  artworks_count  INTEGER     NOT NULL DEFAULT 0 CHECK (artworks_count >= 0),
  sales_count     INTEGER     NOT NULL DEFAULT 0 CHECK (sales_count >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================
-- ARTWORKS
-- =============================================
CREATE TABLE IF NOT EXISTS public.artworks (
  id              UUID                 PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID                 NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title           TEXT                 NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  description     TEXT                 CHECK (char_length(description) <= 2000),
  category        artwork_category     NOT NULL,
  image_url       TEXT                 NOT NULL,
  image_width     INTEGER,
  image_height    INTEGER,
  thumbnail_url   TEXT,
  tags            TEXT[]               DEFAULT '{}',
  visibility      artwork_visibility   NOT NULL DEFAULT 'public',
  availability    artwork_availability NOT NULL DEFAULT 'not_for_sale',
  price           NUMERIC(12,2)        CHECK (price >= 0),
  currency        TEXT                 NOT NULL DEFAULT 'USDT',
  likes_count     INTEGER              NOT NULL DEFAULT 0 CHECK (likes_count >= 0),
  comments_count  INTEGER              NOT NULL DEFAULT 0 CHECK (comments_count >= 0),
  views_count     INTEGER              NOT NULL DEFAULT 0 CHECK (views_count >= 0),
  saves_count     INTEGER              NOT NULL DEFAULT 0 CHECK (saves_count >= 0),
  is_featured     BOOLEAN              NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

DROP TRIGGER IF EXISTS artworks_updated_at ON public.artworks;
CREATE TRIGGER artworks_updated_at
  BEFORE UPDATE ON public.artworks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================
-- LIKES
-- =============================================
CREATE TABLE IF NOT EXISTS public.likes (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  artwork_id  UUID        NOT NULL REFERENCES public.artworks(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT likes_user_artwork_unique UNIQUE (user_id, artwork_id)
);

-- =============================================
-- SAVES
-- =============================================
CREATE TABLE IF NOT EXISTS public.saves (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  artwork_id  UUID        NOT NULL REFERENCES public.artworks(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT saves_user_artwork_unique UNIQUE (user_id, artwork_id)
);

-- =============================================
-- COMMENTS
-- =============================================
CREATE TABLE IF NOT EXISTS public.comments (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  artwork_id  UUID        NOT NULL REFERENCES public.artworks(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  parent_id   UUID        REFERENCES public.comments(id) ON DELETE CASCADE,
  body        TEXT        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  likes_count INTEGER     NOT NULL DEFAULT 0 CHECK (likes_count >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

DROP TRIGGER IF EXISTS comments_updated_at ON public.comments;
CREATE TRIGGER comments_updated_at
  BEFORE UPDATE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================
-- FOLLOWS
-- =============================================
CREATE TABLE IF NOT EXISTS public.follows (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  follower_id   UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  following_id  UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT follows_unique   UNIQUE (follower_id, following_id),
  CONSTRAINT follows_no_self  CHECK  (follower_id != following_id)
);

-- =============================================
-- NOTIFICATIONS
-- =============================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id            UUID              PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_id  UUID              NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  actor_id      UUID              REFERENCES public.users(id) ON DELETE SET NULL,
  type          notification_type NOT NULL,
  entity_id     UUID,
  entity_type   TEXT,
  data          JSONB             DEFAULT '{}',
  is_read       BOOLEAN           NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient
  ON public.notifications (recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON public.notifications (recipient_id, is_read)
  WHERE is_read = FALSE;

-- =============================================
-- CART
-- cart_items is fully replaced by 20240301000000_commerce_schema.sql.
-- We create a minimal version here so the base schema is self-contained.
-- The commerce migration will DROP and recreate it with the full structure.
-- =============================================
CREATE TABLE IF NOT EXISTS public.cart_items (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  artwork_id  UUID        NOT NULL REFERENCES public.artworks(id) ON DELETE CASCADE,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cart_user_artwork_unique UNIQUE (user_id, artwork_id)
);

-- =============================================
-- ORDERS
-- Replaced by 20240301000000_commerce_schema.sql.
-- Minimal stub created here for FK integrity during base schema setup.
-- =============================================
CREATE TABLE IF NOT EXISTS public.orders (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_id    UUID        NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  seller_id   UUID        NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  artwork_id  UUID        NOT NULL REFERENCES public.artworks(id) ON DELETE RESTRICT,
  amount      NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency    TEXT        NOT NULL DEFAULT 'USDT',
  status      TEXT        NOT NULL DEFAULT 'pending',
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS orders_updated_at ON public.orders;
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================
-- TRANSACTIONS
-- Replaced by 20240301000000_commerce_schema.sql.
-- =============================================
CREATE TABLE IF NOT EXISTS public.transactions (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id        UUID        REFERENCES public.orders(id) ON DELETE SET NULL,
  sender_id       UUID        NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  recipient_id    UUID        NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency        TEXT        NOT NULL DEFAULT 'USDT',
  status          TEXT        NOT NULL DEFAULT 'pending',
  tx_hash         TEXT        UNIQUE,
  wallet_address  TEXT,
  network         TEXT        DEFAULT 'tron',
  retry_count     INTEGER     NOT NULL DEFAULT 0,
  expires_at      TIMESTAMPTZ,
  confirmed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS transactions_updated_at ON public.transactions;
CREATE TRIGGER transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================
-- WALLET HISTORY
-- Replaced by wallet_ledger in 20240301000000_commerce_schema.sql.
-- =============================================
CREATE TABLE IF NOT EXISTS public.wallet_history (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID        NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  transaction_id  UUID        REFERENCES public.transactions(id) ON DELETE SET NULL,
  type            TEXT        NOT NULL CHECK (type IN ('credit', 'debit')),
  amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  balance_after   NUMERIC(12,2) NOT NULL,
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- AUDIT LOGS
-- =============================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id    UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  action      TEXT        NOT NULL,
  target_type TEXT,
  target_id   UUID,
  ip_address  TEXT,
  user_agent  TEXT,
  metadata    JSONB       DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);