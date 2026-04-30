-- =============================================
-- EXTENSIONS
-- =============================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";      -- trigram search
CREATE EXTENSION IF NOT EXISTS "unaccent";     -- accent-insensitive search

-- =============================================
-- ENUMS
-- =============================================
CREATE TYPE user_role AS ENUM ('user', 'admin', 'moderator');
CREATE TYPE artwork_category AS ENUM (
  'painting', 'digital', 'photography', 'sculpture',
  'illustration', 'mixed_media', 'print', 'other'
);
CREATE TYPE artwork_visibility AS ENUM ('public', 'private', 'draft');
CREATE TYPE artwork_availability AS ENUM ('available', 'sold', 'reserved', 'not_for_sale');
CREATE TYPE order_status AS ENUM ('pending', 'paid', 'failed', 'refunded', 'cancelled');
CREATE TYPE transaction_status AS ENUM ('pending', 'confirmed', 'failed', 'expired');
CREATE TYPE notification_type AS ENUM (
  'like', 'comment', 'reply', 'follow', 'sale', 'order_update', 'system'
);

-- =============================================
-- UTILITY FUNCTIONS
-- =============================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- USERS
-- =============================================
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_id       UUID UNIQUE NOT NULL,            -- maps to Supabase auth.users.id
  email         TEXT UNIQUE NOT NULL,
  role          user_role NOT NULL DEFAULT 'user',
  is_verified   BOOLEAN NOT NULL DEFAULT FALSE,
  is_disabled   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ                       -- soft delete
);

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================
-- PROFILES
-- =============================================
CREATE TABLE profiles (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  username        TEXT UNIQUE NOT NULL,
  display_name    TEXT,
  bio             TEXT CHECK (char_length(bio) <= 500),
  avatar_url      TEXT,
  website_url     TEXT,
  location        TEXT,
  followers_count INTEGER NOT NULL DEFAULT 0 CHECK (followers_count >= 0),
  following_count INTEGER NOT NULL DEFAULT 0 CHECK (following_count >= 0),
  artworks_count  INTEGER NOT NULL DEFAULT 0 CHECK (artworks_count >= 0),
  sales_count     INTEGER NOT NULL DEFAULT 0 CHECK (sales_count >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================
-- ARTWORKS
-- =============================================
CREATE TABLE artworks (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  description     TEXT CHECK (char_length(description) <= 2000),
  category        artwork_category NOT NULL,
  image_url       TEXT NOT NULL,
  image_width     INTEGER,
  image_height    INTEGER,
  thumbnail_url   TEXT,
  tags            TEXT[] DEFAULT '{}',
  visibility      artwork_visibility NOT NULL DEFAULT 'public',
  availability    artwork_availability NOT NULL DEFAULT 'not_for_sale',
  price           NUMERIC(12, 2) CHECK (price >= 0),
  currency        TEXT NOT NULL DEFAULT 'USDT',
  likes_count     INTEGER NOT NULL DEFAULT 0 CHECK (likes_count >= 0),
  comments_count  INTEGER NOT NULL DEFAULT 0 CHECK (comments_count >= 0),
  views_count     INTEGER NOT NULL DEFAULT 0 CHECK (views_count >= 0),
  saves_count     INTEGER NOT NULL DEFAULT 0 CHECK (saves_count >= 0),
  is_featured     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ                           -- soft delete
);

CREATE TRIGGER artworks_updated_at
  BEFORE UPDATE ON artworks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================
-- LIKES
-- =============================================
CREATE TABLE likes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  artwork_id  UUID NOT NULL REFERENCES artworks(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT likes_user_artwork_unique UNIQUE (user_id, artwork_id)
);

-- =============================================
-- SAVES
-- =============================================
CREATE TABLE saves (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  artwork_id  UUID NOT NULL REFERENCES artworks(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT saves_user_artwork_unique UNIQUE (user_id, artwork_id)
);

-- =============================================
-- COMMENTS
-- =============================================
CREATE TABLE comments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  artwork_id  UUID NOT NULL REFERENCES artworks(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id   UUID REFERENCES comments(id) ON DELETE CASCADE,  -- for replies
  body        TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  likes_count INTEGER NOT NULL DEFAULT 0 CHECK (likes_count >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE TRIGGER comments_updated_at
  BEFORE UPDATE ON comments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================
-- FOLLOWS
-- =============================================
CREATE TABLE follows (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  follower_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT follows_unique UNIQUE (follower_id, following_id),
  CONSTRAINT follows_no_self CHECK (follower_id != following_id)
);

-- =============================================
-- NOTIFICATIONS
-- =============================================
CREATE TABLE notifications (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  type          notification_type NOT NULL,
  entity_id     UUID,            -- artwork_id, comment_id, etc.
  entity_type   TEXT,            -- 'artwork', 'comment', 'follow'
  data          JSONB DEFAULT '{}',
  is_read       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- CART
-- =============================================
CREATE TABLE cart_items (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  artwork_id  UUID NOT NULL REFERENCES artworks(id) ON DELETE CASCADE,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cart_user_artwork_unique UNIQUE (user_id, artwork_id)
);

-- =============================================
-- ORDERS
-- =============================================
CREATE TABLE orders (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_id        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  seller_id       UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  artwork_id      UUID NOT NULL REFERENCES artworks(id) ON DELETE RESTRICT,
  amount          NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  currency        TEXT NOT NULL DEFAULT 'USDT',
  status          order_status NOT NULL DEFAULT 'pending',
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================
-- TRANSACTIONS (USDT wallet)
-- =============================================
CREATE TABLE transactions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id        UUID REFERENCES orders(id) ON DELETE SET NULL,
  sender_id       UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  recipient_id    UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount          NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  currency        TEXT NOT NULL DEFAULT 'USDT',
  status          transaction_status NOT NULL DEFAULT 'pending',
  tx_hash         TEXT UNIQUE,               -- blockchain transaction hash
  wallet_address  TEXT,                      -- sender wallet address
  network         TEXT DEFAULT 'tron',       -- TRC20, ERC20, etc.
  retry_count     INTEGER NOT NULL DEFAULT 0,
  expires_at      TIMESTAMPTZ,
  confirmed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================
-- WALLET HISTORY (running balance per user)
-- =============================================
CREATE TABLE wallet_history (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  transaction_id  UUID REFERENCES transactions(id) ON DELETE SET NULL,
  type            TEXT NOT NULL CHECK (type IN ('credit', 'debit')),
  amount          NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  balance_after   NUMERIC(12, 2) NOT NULL,
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- AUDIT LOGS
-- =============================================
CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,               -- e.g. 'user.login', 'artwork.delete'
  target_type TEXT,
  target_id   UUID,
  ip_address  TEXT,
  user_agent  TEXT,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);