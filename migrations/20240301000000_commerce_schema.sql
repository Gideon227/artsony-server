-- ═══════════════════════════════════════════════════════════════════════════
-- Artsony — Commerce Schema
-- Migration: 20240301000000_commerce_schema.sql
--
-- Drops and recreates the stub commerce tables from 001_initial_schema.sql
-- (cart_items, orders, transactions, wallet_history) with the full
-- production-grade structure required by the ecommerce store.
--
-- Also adds:
--   • order_items          — per-line-item with full artwork + variant snapshot
--   • shipping_addresses   — user's saved address book
--   • digital_delivery_tokens — signed download tokens for digital purchases
--   • wallet_ledger        — replaces wallet_history with cleaner structure
--   • purchase_count       — denormalised counter on artworks
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Drop stubs from 001_initial_schema.sql ────────────────────────────────
-- These tables exist but are too thin. We drop in reverse dependency order.

DROP TABLE IF EXISTS public.wallet_history      CASCADE;
DROP TABLE IF EXISTS public.transactions        CASCADE;
DROP TABLE IF EXISTS public.orders              CASCADE;
DROP TABLE IF EXISTS public.cart_items          CASCADE;

-- ── Drop old enums that conflict with new naming conventions ──────────────

DROP TYPE IF EXISTS order_status        CASCADE;
DROP TYPE IF EXISTS transaction_status  CASCADE;

-- ── New enums ─────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE order_status AS ENUM (
    'PENDING_PAYMENT',
    'PAYMENT_CONFIRMED',
    'PROCESSING',
    'SHIPPED',
    'FULFILLED',
    'COMPLETED',
    'CANCELLED',
    'REFUNDED'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE transaction_status AS ENUM (
    'PENDING',
    'CONFIRMING',
    'CONFIRMED',
    'FAILED',
    'EXPIRED'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE wallet_network AS ENUM ('TRON', 'ETHEREUM', 'BSC');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE wallet_ledger_entry_type AS ENUM ('CREDIT', 'DEBIT');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ── Add purchase_count to artworks ────────────────────────────────────────
-- Denormalised counter incremented by trigger on order_items status change.
-- Default 0; never null.

ALTER TABLE public.artworks
  ADD COLUMN IF NOT EXISTS purchase_count INTEGER NOT NULL DEFAULT 0
    CHECK (purchase_count >= 0);

-- ── shipping_addresses ────────────────────────────────────────────────────
-- User's saved address book. The selected address is snapshotted onto the
-- order at checkout — this table is convenience only, not the source of
-- truth for order delivery details.

CREATE TABLE IF NOT EXISTS public.shipping_addresses (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID         NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  label            VARCHAR(80),                           -- e.g. "Home", "Studio"
  full_name        VARCHAR(200) NOT NULL,
  phone            VARCHAR(30)  NOT NULL,
  address_line_1   VARCHAR(300) NOT NULL,
  address_line_2   VARCHAR(300),
  city             VARCHAR(100) NOT NULL,
  state            VARCHAR(100) NOT NULL,
  postal_code      VARCHAR(20)  NOT NULL,
  country_code     CHAR(2)      NOT NULL,                 -- ISO 3166-1 alpha-2
  is_default       BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shipping_addresses_user
  ON public.shipping_addresses (user_id);

-- Ensure only one default address per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_shipping_addresses_default
  ON public.shipping_addresses (user_id)
  WHERE is_default = TRUE;

CREATE OR REPLACE FUNCTION public.set_shipping_address_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shipping_address_updated_at ON public.shipping_addresses;
CREATE TRIGGER shipping_address_updated_at
  BEFORE UPDATE ON public.shipping_addresses
  FOR EACH ROW EXECUTE FUNCTION public.set_shipping_address_updated_at();

-- ── cart_items ────────────────────────────────────────────────────────────
-- Stores each item a user has added to their cart.
--
-- Snapshot columns (price_at_add, currency_at_add, variant_snapshot) are
-- written once at add-to-cart time. They let the service detect price
-- changes and stale variant options without recomputing from the artwork.

CREATE TABLE IF NOT EXISTS public.cart_items (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID          NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  artwork_id        UUID          NOT NULL REFERENCES public.artworks(id) ON DELETE CASCADE,
  quantity          INTEGER       NOT NULL DEFAULT 1
                                    CHECK (quantity BETWEEN 1 AND 100),
  price_at_add      NUMERIC(12,2) NOT NULL CHECK (price_at_add >= 0),
  currency_at_add   VARCHAR(10)   NOT NULL,
  variant_snapshot  JSONB,
  added_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Expression-based unique index must be defined outside CREATE TABLE in PostgreSQL
CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_items_unique_line
  ON public.cart_items (user_id, artwork_id, (variant_snapshot->>'option_id'));

CREATE INDEX IF NOT EXISTS idx_cart_items_user
  ON public.cart_items (user_id, added_at DESC);

CREATE INDEX IF NOT EXISTS idx_cart_items_artwork
  ON public.cart_items (artwork_id);

-- ── orders ────────────────────────────────────────────────────────────────
-- One order per checkout session. Contains the overall payment state and
-- the shipping address snapshot for physical deliveries.
--
-- pricing_currency is set at order creation from the first item's currency;
-- all items in a single order must share the same currency (enforced at
-- service layer).

CREATE TABLE IF NOT EXISTS public.orders (
  id                    UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id              UUID           NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,

  status                order_status   NOT NULL DEFAULT 'PENDING_PAYMENT',

  subtotal              NUMERIC(12,2)  NOT NULL CHECK (subtotal > 0),
  currency              VARCHAR(10)    NOT NULL DEFAULT 'USDT',

  -- Shipping address snapshot (null for digital-only orders)
  -- JSONB shape: { full_name, phone, address_line_1, address_line_2,
  --                city, state, postal_code, country_code }
  shipping_address      JSONB,

  -- Client-provided idempotency key (UUID). Unique constraint prevents
  -- duplicate orders from retried checkout requests.
  idempotency_key       UUID           NOT NULL,

  notes                 TEXT           CHECK (char_length(notes) <= 1000),

  created_at            TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

  CONSTRAINT orders_idempotency_key_unique UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_orders_buyer_status
  ON public.orders (buyer_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_status_created
  ON public.orders (status, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_order_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_updated_at ON public.orders;
CREATE TRIGGER order_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_order_updated_at();

-- ── order_items ───────────────────────────────────────────────────────────
-- One row per artwork purchased within an order.
--
-- All artwork + variant data is snapshotted at order creation time so that
-- order receipts remain accurate even if the artwork is later edited,
-- archived, or hard-deleted.

CREATE TABLE IF NOT EXISTS public.order_items (
  id                     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id               UUID          NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  artwork_id             UUID          NOT NULL REFERENCES public.artworks(id) ON DELETE RESTRICT,
  seller_id              UUID          NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,

  -- Artwork snapshot
  artwork_title          VARCHAR(300)  NOT NULL,
  artwork_slug           VARCHAR(350)  NOT NULL,
  artwork_thumbnail_url  TEXT,
  artwork_format         VARCHAR(20)   NOT NULL CHECK (artwork_format IN ('DIGITAL', 'PHYSICAL')),

  -- Pricing snapshot
  unit_price             NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  currency               VARCHAR(10)   NOT NULL,
  quantity               INTEGER       NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  line_total             NUMERIC(12,2) NOT NULL
                           GENERATED ALWAYS AS (unit_price * quantity) STORED,

  -- Variant snapshot (null when artwork has no variants)
  -- JSONB shape: { variant_id, variant_type, variant_name,
  --                option_id, option_label, price_modifier, sku }
  variant_snapshot       JSONB,

  created_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order
  ON public.order_items (order_id);

CREATE INDEX IF NOT EXISTS idx_order_items_artwork
  ON public.order_items (artwork_id);

CREATE INDEX IF NOT EXISTS idx_order_items_seller
  ON public.order_items (seller_id, created_at DESC);

-- ── digital_delivery_tokens ───────────────────────────────────────────────
-- One token per digital order_item, generated when the order reaches
-- FULFILLED status. The raw token is never stored — only an argon2 hash.
-- The buyer redeems the token to get a short-lived signed Cloudinary URL.

CREATE TABLE IF NOT EXISTS public.digital_delivery_tokens (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id       UUID         NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  artwork_id          UUID         NOT NULL REFERENCES public.artworks(id) ON DELETE RESTRICT,
  buyer_id            UUID         NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,

  -- argon2 hash of the raw token sent to the buyer
  token_hash          TEXT         NOT NULL UNIQUE,

  expires_at          TIMESTAMPTZ  NOT NULL,
  download_count      INTEGER      NOT NULL DEFAULT 0 CHECK (download_count >= 0),
  max_downloads       INTEGER      NOT NULL DEFAULT 3 CHECK (max_downloads >= 1),
  last_downloaded_at  TIMESTAMPTZ,

  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT digital_delivery_tokens_one_per_item
    UNIQUE (order_item_id)
);

-- O(1) token lookup by hash — this is the hot path for every download
CREATE INDEX IF NOT EXISTS idx_digital_delivery_token_hash
  ON public.digital_delivery_tokens (token_hash);

CREATE INDEX IF NOT EXISTS idx_digital_delivery_buyer
  ON public.digital_delivery_tokens (buyer_id, expires_at);

-- ── transactions ──────────────────────────────────────────────────────────
-- One transaction per order. Tracks the USDT payment lifecycle from
-- the moment the buyer is shown a wallet address through blockchain
-- confirmation.

CREATE TABLE IF NOT EXISTS public.transactions (
  id                       UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                 UUID               NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,

  status                   transaction_status NOT NULL DEFAULT 'PENDING',

  amount                   NUMERIC(12,2)      NOT NULL CHECK (amount > 0),
  currency                 VARCHAR(10)        NOT NULL DEFAULT 'USDT',

  network                  wallet_network     NOT NULL DEFAULT 'TRON',
  recipient_wallet_address TEXT               NOT NULL,
  sender_wallet_address    TEXT,

  -- Blockchain transaction hash — unique once set, null until submitted
  tx_hash                  TEXT               UNIQUE,

  -- Block number at which the transaction was confirmed on-chain
  confirmation_block       BIGINT,

  -- Retry tracking for the background verification job
  retry_count              INTEGER            NOT NULL DEFAULT 0,
  last_retry_at            TIMESTAMPTZ,

  -- Order expires if payment is not confirmed within this window
  expires_at               TIMESTAMPTZ        NOT NULL,
  confirmed_at             TIMESTAMPTZ,

  created_at               TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ        NOT NULL DEFAULT NOW(),

  CONSTRAINT transactions_one_per_order UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS idx_transactions_order
  ON public.transactions (order_id);

CREATE INDEX IF NOT EXISTS idx_transactions_status_expires
  ON public.transactions (status, expires_at)
  WHERE status IN ('PENDING', 'CONFIRMING');

-- Blockchain hash lookup — used for replay attack prevention
CREATE INDEX IF NOT EXISTS idx_transactions_tx_hash
  ON public.transactions (tx_hash)
  WHERE tx_hash IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_transaction_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS transaction_updated_at ON public.transactions;
CREATE TRIGGER transaction_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_transaction_updated_at();

-- ── wallet_ledger ─────────────────────────────────────────────────────────
-- Running ledger of all credit/debit events per user.
-- Replaces the wallet_history table from 001_initial_schema.sql.

CREATE TABLE IF NOT EXISTS public.wallet_ledger (
  id              UUID                     PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID                     NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  transaction_id  UUID                     REFERENCES public.transactions(id) ON DELETE SET NULL,
  order_id        UUID                     REFERENCES public.orders(id) ON DELETE SET NULL,
  type            wallet_ledger_entry_type NOT NULL,
  amount          NUMERIC(12,2)            NOT NULL CHECK (amount > 0),
  balance_after   NUMERIC(12,2)            NOT NULL,
  description     TEXT                     NOT NULL,
  created_at      TIMESTAMPTZ              NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_user
  ON public.wallet_ledger (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_transaction
  ON public.wallet_ledger (transaction_id)
  WHERE transaction_id IS NOT NULL;

-- ── purchase_count trigger ────────────────────────────────────────────────
-- Increments artworks.purchase_count whenever an order_item's parent
-- order transitions to COMPLETED. Fired on orders.status UPDATE.

CREATE OR REPLACE FUNCTION public.increment_artwork_purchase_counts()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'COMPLETED' AND OLD.status != 'COMPLETED' THEN
    UPDATE public.artworks a
    SET purchase_count = purchase_count + oi.quantity
    FROM public.order_items oi
    WHERE oi.order_id = NEW.id
      AND oi.artwork_id = a.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_completed_purchase_count ON public.orders;
CREATE TRIGGER order_completed_purchase_count
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.increment_artwork_purchase_counts();

-- ── Stock management RPCs ─────────────────────────────────────────────────
-- Called by the checkout service inside a transaction to atomically
-- decrement available stock, preventing oversell on concurrent checkouts.

-- reserve_artwork_stock:
--   For PHYSICAL artworks: decrements physical_details->>'available_quantity'.
--   For variant options:   decrements the matching option's 'stock' field
--                          inside the variants JSONB array.
--   Returns TRUE on success, FALSE if stock is insufficient.

CREATE OR REPLACE FUNCTION public.reserve_artwork_stock(
  p_artwork_id        UUID,
  p_quantity          INTEGER,
  p_variant_option_id TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql AS $$
DECLARE
  v_physical   JSONB;
  v_qty        INTEGER;
  v_variants   JSONB;
  v_opt_stock  INTEGER;
BEGIN
  -- Lock the row exclusively for the duration of this transaction
  SELECT physical_details, variants
  INTO   v_physical, v_variants
  FROM   public.artworks
  WHERE  id = p_artwork_id
    AND  deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- ── Physical stock check ───────────────────────────────────────────────
  IF v_physical IS NOT NULL THEN
    v_qty := (v_physical->>'available_quantity')::INTEGER;
    IF v_qty < p_quantity THEN
      RETURN FALSE;
    END IF;
    v_physical := jsonb_set(
      v_physical,
      '{available_quantity}',
      to_jsonb(v_qty - p_quantity)
    );
  END IF;

  -- ── Variant option stock check ────────────────────────────────────────
  IF p_variant_option_id IS NOT NULL AND v_variants IS NOT NULL THEN
    DECLARE
      v_variant_idx  INTEGER;
      v_option_idx   INTEGER;
      v_option       JSONB;
    BEGIN
      -- Walk variants array to find the matching option
      FOR v_variant_idx IN 0 .. jsonb_array_length(v_variants) - 1 LOOP
        FOR v_option_idx IN 0 .. jsonb_array_length(v_variants->v_variant_idx->'options') - 1 LOOP
          v_option := v_variants->v_variant_idx->'options'->v_option_idx;
          IF (v_option->>'id') = p_variant_option_id THEN
            -- stock = null means unlimited; only block if a numeric limit is set
            IF (v_option->>'stock') IS NOT NULL THEN
              v_opt_stock := (v_option->>'stock')::INTEGER;
              IF v_opt_stock < p_quantity THEN
                RETURN FALSE;
              END IF;
              v_variants := jsonb_set(
                v_variants,
                ARRAY[v_variant_idx::TEXT, 'options', v_option_idx::TEXT, 'stock'],
                to_jsonb(v_opt_stock - p_quantity)
              );
            END IF;
          END IF;
        END LOOP;
      END LOOP;
    END;
  END IF;

  -- Persist the updated JSONB columns
  UPDATE public.artworks
  SET physical_details = v_physical,
      variants         = v_variants,
      updated_at       = NOW()
  WHERE id = p_artwork_id;

  RETURN TRUE;
END;
$$;

-- release_artwork_stock:
--   Mirror of reserve — called on order cancellation to restore stock.

CREATE OR REPLACE FUNCTION public.release_artwork_stock(
  p_artwork_id        UUID,
  p_quantity          INTEGER,
  p_variant_option_id TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  v_physical   JSONB;
  v_variants   JSONB;
BEGIN
  SELECT physical_details, variants
  INTO   v_physical, v_variants
  FROM   public.artworks
  WHERE  id = p_artwork_id
    AND  deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_physical IS NOT NULL THEN
    v_physical := jsonb_set(
      v_physical,
      '{available_quantity}',
      to_jsonb((v_physical->>'available_quantity')::INTEGER + p_quantity)
    );
  END IF;

  IF p_variant_option_id IS NOT NULL AND v_variants IS NOT NULL THEN
    DECLARE
      v_variant_idx INTEGER;
      v_option_idx  INTEGER;
      v_option      JSONB;
    BEGIN
      FOR v_variant_idx IN 0 .. jsonb_array_length(v_variants) - 1 LOOP
        FOR v_option_idx IN 0 .. jsonb_array_length(v_variants->v_variant_idx->'options') - 1 LOOP
          v_option := v_variants->v_variant_idx->'options'->v_option_idx;
          IF (v_option->>'id') = p_variant_option_id AND (v_option->>'stock') IS NOT NULL THEN
            v_variants := jsonb_set(
              v_variants,
              ARRAY[v_variant_idx::TEXT, 'options', v_option_idx::TEXT, 'stock'],
              to_jsonb((v_option->>'stock')::INTEGER + p_quantity)
            );
          END IF;
        END LOOP;
      END LOOP;
    END;
  END IF;

  UPDATE public.artworks
  SET physical_details = v_physical,
      variants         = v_variants,
      updated_at       = NOW()
  WHERE id = p_artwork_id;
END;
$$;

-- ── RLS ───────────────────────────────────────────────────────────────────
-- All tables use the service role which bypasses RLS.
-- Deny-all policies protect against accidental anon/authenticated access.

ALTER TABLE public.shipping_addresses        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.digital_delivery_tokens   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_ledger             ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_all_shipping_addresses"      ON public.shipping_addresses      USING (FALSE);
CREATE POLICY "deny_all_cart_items"              ON public.cart_items              USING (FALSE);
CREATE POLICY "deny_all_orders"                  ON public.orders                  USING (FALSE);
CREATE POLICY "deny_all_order_items"             ON public.order_items             USING (FALSE);
CREATE POLICY "deny_all_digital_delivery_tokens" ON public.digital_delivery_tokens USING (FALSE);
CREATE POLICY "deny_all_transactions"            ON public.transactions            USING (FALSE);
CREATE POLICY "deny_all_wallet_ledger"           ON public.wallet_ledger           USING (FALSE);
