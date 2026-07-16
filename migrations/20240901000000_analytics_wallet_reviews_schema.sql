-- ═══════════════════════════════════════════════════════════════════════════
-- Artsony — Analytics, Wallet Hold/Withdrawal, Reviews & Engagement Schema
-- Migration: 20240901000000_analytics_wallet_reviews_schema.sql
--
-- Adds, without altering existing money-flow guarantees for past rows:
--   • wallet_ledger: category / hold_status / order_item_id /
--     withdrawal_request_id / available_at columns
--   • withdrawal_requests           — artist payout requests (no PSP wired up)
--   • order_reviews                 — purchase-verified rating + comment
--   • artwork_likes                 — first real like backing store
--   • artwork_engagement_daily      — daily view/like rollup for trend charts
--   • get_artist_balance_summary()  — single source of truth for
--     available / pending / on-hold / withdrawn balances
--   • request_withdrawal() / transition_withdrawal()
--   • transition_delivery_hold()
--   • toggle_artwork_like()
--   • increment_artwork_view_count() — redefined to also roll up daily views
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Enums ─────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE wallet_ledger_category AS ENUM ('SALE', 'WITHDRAWAL', 'REFUND', 'ADJUSTMENT');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE wallet_ledger_hold_status AS ENUM ('PENDING_DELIVERY', 'ON_HOLD', 'AVAILABLE');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE withdrawal_status AS ENUM (
    'PENDING', 'PROCESSING', 'COMPLETED', 'REJECTED', 'FAILED', 'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ── wallet_ledger: new columns ─────────────────────────────────────────────────
-- Existing rows (all produced by the old "credit immediately on payment
-- confirmation" path, and buyer refund credits) are backfilled as already
-- AVAILABLE — this preserves the exact balance every existing user saw
-- before this migration. Only NEW sale credits (inserted after this
-- migration ships) start life as PENDING_DELIVERY / ON_HOLD.

ALTER TABLE public.wallet_ledger
  ADD COLUMN IF NOT EXISTS category               wallet_ledger_category    NOT NULL DEFAULT 'SALE',
  ADD COLUMN IF NOT EXISTS hold_status             wallet_ledger_hold_status NOT NULL DEFAULT 'AVAILABLE',
  ADD COLUMN IF NOT EXISTS order_item_id           UUID REFERENCES public.order_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS withdrawal_request_id   UUID,   -- FK added below, after withdrawal_requests exists
  ADD COLUMN IF NOT EXISTS available_at            TIMESTAMPTZ;

-- UPDATE public.wallet_ledger
-- SET category    = CASE WHEN description ILIKE 'Refund%' THEN 'REFUND' ELSE 'SALE' END,
UPDATE public.wallet_ledger
SET category = (
      CASE
        WHEN description ILIKE 'Refund%' THEN 'REFUND'
        ELSE 'SALE'
      END
    )::wallet_ledger_category,
    hold_status = 'AVAILABLE'::wallet_ledger_hold_status,
    available_at = created_at
WHERE available_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_user_category_hold
  ON public.wallet_ledger (user_id, category, hold_status);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_order_item
  ON public.wallet_ledger (order_item_id)
  WHERE order_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_available_at
  ON public.wallet_ledger (hold_status, available_at)
  WHERE hold_status = 'ON_HOLD';

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_user_created
  ON public.wallet_ledger (user_id, created_at DESC);

-- ── withdrawal_requests ────────────────────────────────────────────────────────
-- No payment/payout integration yet — destination is stored for the admin's
-- reference only and no automatic transfer is attempted. completed_at is
-- set when an admin marks the (manually executed, off-platform) payout done.

CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
  id                    UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID               NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,

  amount                NUMERIC(12,2)      NOT NULL CHECK (amount > 0),
  currency              VARCHAR(10)        NOT NULL DEFAULT 'USDT',

  status                withdrawal_status  NOT NULL DEFAULT 'PENDING',

  destination_type      VARCHAR(30)        NOT NULL,   -- e.g. 'WALLET_ADDRESS', 'BANK_ACCOUNT'
  destination_details   JSONB              NOT NULL DEFAULT '{}',  -- free-form, validated at service layer

  idempotency_key       UUID               NOT NULL,

  admin_notes           TEXT,
  reviewed_by           UUID               REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at           TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,

  created_at            TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ        NOT NULL DEFAULT NOW(),

  CONSTRAINT withdrawal_requests_idempotency_key_unique UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_user_status
  ON public.withdrawal_requests (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status
  ON public.withdrawal_requests (status, created_at DESC);

DROP TRIGGER IF EXISTS withdrawal_requests_updated_at ON public.withdrawal_requests;
CREATE TRIGGER withdrawal_requests_updated_at
  BEFORE UPDATE ON public.withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.wallet_ledger
  ADD CONSTRAINT wallet_ledger_withdrawal_request_fkey
  FOREIGN KEY (withdrawal_request_id) REFERENCES public.withdrawal_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_withdrawal_request
  ON public.wallet_ledger (withdrawal_request_id)
  WHERE withdrawal_request_id IS NOT NULL;

-- ── order_reviews ─────────────────────────────────────────────────────────────
-- One review per order_item, only insertable by that item's buyer, only once
-- the item has actually been fulfilled/delivered (enforced at service layer
-- against orders.status / order_item_physical.timeline_status — mirrors how
-- order_refund_requests defers legality checks to the service layer while
-- the schema itself only enforces shape + uniqueness).

CREATE TABLE IF NOT EXISTS public.order_reviews (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id  UUID          NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  order_id       UUID          NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  artwork_id     UUID          NOT NULL REFERENCES public.artworks(id) ON DELETE CASCADE,
  buyer_id       UUID          NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  seller_id      UUID          NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

  rating         SMALLINT      NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment        TEXT          CHECK (comment IS NULL OR char_length(comment) <= 2000),

  -- Sub-scores feeding the Artsony Score's "order reliability" component.
  -- Optional — buyer may leave a star rating without answering these.
  condition_rating       SMALLINT CHECK (condition_rating IS NULL OR condition_rating BETWEEN 1 AND 5),
  delivery_rating         SMALLINT CHECK (delivery_rating IS NULL OR delivery_rating BETWEEN 1 AND 5),

  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT order_reviews_one_per_item UNIQUE (order_item_id)
);

CREATE INDEX IF NOT EXISTS idx_order_reviews_seller
  ON public.order_reviews (seller_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_reviews_artwork
  ON public.order_reviews (artwork_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_reviews_buyer
  ON public.order_reviews (buyer_id);

DROP TRIGGER IF EXISTS order_reviews_updated_at ON public.order_reviews;
CREATE TRIGGER order_reviews_updated_at
  BEFORE UPDATE ON public.order_reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── artwork_likes ─────────────────────────────────────────────────────────────
-- artworks.like_count already exists as a denormalised counter but nothing
-- in the codebase writes to it today. This table is the first real backing
-- store for a like action; toggle_artwork_like() below keeps the counter
-- and the daily engagement rollup in sync atomically.

CREATE TABLE IF NOT EXISTS public.artwork_likes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  artwork_id  UUID        NOT NULL REFERENCES public.artworks(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT artwork_likes_user_artwork_unique UNIQUE (user_id, artwork_id)
);

CREATE INDEX IF NOT EXISTS idx_artwork_likes_artwork ON public.artwork_likes (artwork_id);
CREATE INDEX IF NOT EXISTS idx_artwork_likes_user     ON public.artwork_likes (user_id);

-- ── artwork_engagement_daily ────────────────────────────────────────────────────
-- One row per (artwork, day). Populated incrementally by
-- increment_artwork_view_count() and toggle_artwork_like() — never backfilled
-- retroactively, so history starts from the day this migration ships.

CREATE TABLE IF NOT EXISTS public.artwork_engagement_daily (
  artwork_id   UUID    NOT NULL REFERENCES public.artworks(id) ON DELETE CASCADE,
  day          DATE    NOT NULL,
  view_count   INTEGER NOT NULL DEFAULT 0 CHECK (view_count >= 0),
  like_count   INTEGER NOT NULL DEFAULT 0 CHECK (like_count >= 0),

  PRIMARY KEY (artwork_id, day)
);

CREATE INDEX IF NOT EXISTS idx_artwork_engagement_daily_day
  ON public.artwork_engagement_daily (day);

-- Creator-scoped trend queries (top artwork of the week, etc.) join through
-- artworks.creator_id — this index makes that join cheap for a date-range scan.
CREATE INDEX IF NOT EXISTS idx_artwork_engagement_daily_artwork_day
  ON public.artwork_engagement_daily (artwork_id, day DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- RPC FUNCTIONS
-- ════════════════════════════════════════════════════════════════════════════

-- ── get_artist_balance_summary ─────────────────────────────────────────────────
-- Single source of truth for balance figures. Used by both the withdrawal
-- RPC (to validate a request) and the wallet/analytics read path (to
-- display figures) so the two can never disagree.
--
--   available_balance  = SALE credits already AVAILABLE, or ON_HOLD whose
--                         hold window has elapsed, plus REFUND/ADJUSTMENT
--                         credits, minus all WITHDRAWAL/ADJUSTMENT debits.
--   pending_balance     = SALE credits for items not yet delivered.
--   hold_balance         = SALE credits for delivered items still inside
--                         their hold window.
--   total_withdrawn     = WITHDRAWAL debits whose request has COMPLETED.
--   total_earned        = all-time SALE credits (gross, ignoring hold state).

CREATE OR REPLACE FUNCTION public.get_artist_balance_summary(p_user_id UUID)
RETURNS TABLE (
  available_balance NUMERIC,
  pending_balance    NUMERIC,
  hold_balance        NUMERIC,
  total_withdrawn    NUMERIC,
  total_earned       NUMERIC
)
LANGUAGE sql STABLE AS $$
  SELECT
    COALESCE(SUM(CASE
      WHEN wl.type = 'CREDIT' AND wl.category = 'SALE' AND wl.hold_status = 'AVAILABLE' THEN wl.amount
      WHEN wl.type = 'CREDIT' AND wl.category = 'SALE' AND wl.hold_status = 'ON_HOLD' AND wl.available_at <= NOW() THEN wl.amount
      WHEN wl.type = 'CREDIT' AND wl.category IN ('REFUND', 'ADJUSTMENT') THEN wl.amount
      WHEN wl.type = 'DEBIT'  AND wl.category IN ('WITHDRAWAL', 'ADJUSTMENT') THEN -wl.amount
      ELSE 0
    END), 0) AS available_balance,
    COALESCE(SUM(CASE
      WHEN wl.type = 'CREDIT' AND wl.category = 'SALE' AND wl.hold_status = 'PENDING_DELIVERY' THEN wl.amount
      ELSE 0
    END), 0) AS pending_balance,
    COALESCE(SUM(CASE
      WHEN wl.type = 'CREDIT' AND wl.category = 'SALE' AND wl.hold_status = 'ON_HOLD' AND wl.available_at > NOW() THEN wl.amount
      ELSE 0
    END), 0) AS hold_balance,
    COALESCE((
      SELECT SUM(wl2.amount)
      FROM public.wallet_ledger wl2
      JOIN public.withdrawal_requests wr ON wr.id = wl2.withdrawal_request_id
      WHERE wl2.user_id = p_user_id
        AND wl2.type = 'DEBIT'
        AND wl2.category = 'WITHDRAWAL'
        AND wr.status = 'COMPLETED'
    ), 0) AS total_withdrawn,
    COALESCE(SUM(CASE
      WHEN wl.type = 'CREDIT' AND wl.category = 'SALE' THEN wl.amount
      ELSE 0
    END), 0) AS total_earned
  FROM public.wallet_ledger wl
  WHERE wl.user_id = p_user_id;
$$;

-- ── transition_delivery_hold ────────────────────────────────────────────────────
-- Called when a physical order item is marked DELIVERED. Moves the matching
-- PENDING_DELIVERY sale credit(s) into ON_HOLD with an available_at set
-- p_hold_days in the future. Idempotent: if no PENDING_DELIVERY row is found
-- (already transitioned, or a digital item with no such row), it's a no-op.

CREATE OR REPLACE FUNCTION public.transition_delivery_hold(
  p_order_item_id UUID,
  p_hold_days     INTEGER
)
RETURNS SETOF public.wallet_ledger
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
    UPDATE public.wallet_ledger
    SET hold_status  = 'ON_HOLD',
        available_at = NOW() + make_interval(days => p_hold_days)
    WHERE order_item_id = p_order_item_id
      AND type = 'CREDIT'
      AND category = 'SALE'
      AND hold_status = 'PENDING_DELIVERY'
    RETURNING *;
END;
$$;

-- ── request_withdrawal ───────────────────────────────────────────────────────────
-- Atomically validates available balance and reserves the requested amount
-- by writing the WITHDRAWAL debit immediately (so a second concurrent
-- request against the same balance cannot also succeed). Serialises
-- concurrent requests from the same user via a transaction-scoped advisory
-- lock (aggregate SUMs cannot be protected with SELECT ... FOR UPDATE).
-- Idempotent on (idempotency_key): a retried request with the same key
-- returns the original row rather than creating a duplicate.

CREATE OR REPLACE FUNCTION public.request_withdrawal(
  p_user_id             UUID,
  p_amount              NUMERIC,
  p_destination_type    TEXT,
  p_destination_details JSONB,
  p_idempotency_key     UUID
)
RETURNS SETOF public.withdrawal_requests
LANGUAGE plpgsql AS $$
DECLARE
  v_existing   public.withdrawal_requests%ROWTYPE;
  v_available  NUMERIC;
  v_gross      NUMERIC;
  v_request_id UUID := gen_random_uuid();
BEGIN
  SELECT * INTO v_existing
  FROM public.withdrawal_requests
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN QUERY SELECT * FROM public.withdrawal_requests WHERE id = v_existing.id;
    RETURN;
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount: withdrawal amount must be positive'
      USING ERRCODE = '22023';
  END IF;

  -- Serialise all withdrawal requests for this user for the rest of this
  -- transaction. Automatically released at COMMIT/ROLLBACK.
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));

  SELECT available_balance INTO v_available
  FROM public.get_artist_balance_summary(p_user_id);

  IF p_amount > v_available THEN
    RAISE EXCEPTION 'insufficient_balance: requested % exceeds available %', p_amount, v_available
      USING ERRCODE = '23514';
  END IF;

  -- Running gross balance_after figure (kept for backward-compatible display
  -- of "total ledger balance" alongside the new available/pending/hold split).
  SELECT COALESCE(balance_after, 0) INTO v_gross
  FROM public.wallet_ledger
  WHERE user_id = p_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  INSERT INTO public.withdrawal_requests (
    id, user_id, amount, destination_type, destination_details, idempotency_key, status
  ) VALUES (
    v_request_id, p_user_id, p_amount, p_destination_type, p_destination_details, p_idempotency_key, 'PENDING'
  );

  INSERT INTO public.wallet_ledger (
    user_id, transaction_id, order_id, order_item_id, withdrawal_request_id,
    type, category, amount, balance_after, hold_status, available_at, description
  ) VALUES (
    p_user_id, NULL, NULL, NULL, v_request_id,
    'DEBIT', 'WITHDRAWAL', p_amount, COALESCE(v_gross, 0) - p_amount, 'AVAILABLE', NOW(),
    'Withdrawal request ' || v_request_id
  );

  RETURN QUERY SELECT * FROM public.withdrawal_requests WHERE id = v_request_id;
END;
$$;

-- ── transition_withdrawal ────────────────────────────────────────────────────────
-- Single entry point for all admin/self-service withdrawal status changes.
-- On REJECTED / FAILED / CANCELLED, reverses the original reservation with
-- an ADJUSTMENT credit so the funds become available again.

CREATE OR REPLACE FUNCTION public.transition_withdrawal(
  p_request_id UUID,
  p_new_status withdrawal_status,
  p_actor_id   UUID,
  p_notes      TEXT DEFAULT NULL
)
RETURNS SETOF public.withdrawal_requests
LANGUAGE plpgsql AS $$
DECLARE
  req         public.withdrawal_requests%ROWTYPE;
  is_legal    BOOLEAN;
  v_gross     NUMERIC;
BEGIN
  SELECT * INTO req
  FROM public.withdrawal_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Withdrawal request not found: %', p_request_id;
  END IF;

  is_legal := (req.status = 'PENDING'    AND p_new_status IN ('PROCESSING', 'REJECTED', 'CANCELLED'))
           OR (req.status = 'PROCESSING' AND p_new_status IN ('COMPLETED', 'FAILED'));

  IF NOT is_legal THEN
    RAISE EXCEPTION 'Cannot transition withdrawal request from % to %', req.status, p_new_status;
  END IF;

  UPDATE public.withdrawal_requests
  SET status       = p_new_status,
      reviewed_by  = p_actor_id,
      admin_notes  = COALESCE(p_notes, admin_notes),
      reviewed_at  = NOW(),
      completed_at = CASE WHEN p_new_status = 'COMPLETED' THEN NOW() ELSE completed_at END
  WHERE id = p_request_id;

  IF p_new_status IN ('REJECTED', 'FAILED', 'CANCELLED') THEN
    SELECT COALESCE(balance_after, 0) INTO v_gross
    FROM public.wallet_ledger
    WHERE user_id = req.user_id
    ORDER BY created_at DESC
    LIMIT 1;

    INSERT INTO public.wallet_ledger (
      user_id, withdrawal_request_id, type, category, amount, balance_after,
      hold_status, available_at, description
    ) VALUES (
      req.user_id, req.id, 'CREDIT', 'ADJUSTMENT', req.amount, COALESCE(v_gross, 0) + req.amount,
      'AVAILABLE', NOW(),
      'Reversal of withdrawal ' || req.id || ' (' || p_new_status || ')'
    );
  END IF;

  RETURN QUERY SELECT * FROM public.withdrawal_requests WHERE id = p_request_id;
END;
$$;

-- ── toggle_artwork_like ───────────────────────────────────────────────────────
-- Atomically inserts/deletes the like row, updates artworks.like_count, and
-- rolls the delta into today's artwork_engagement_daily row.

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
    SET like_count = GREATEST(like_count - 1, 0)
    WHERE id = p_artwork_id
    RETURNING like_count INTO v_count;

    INSERT INTO public.artwork_engagement_daily (artwork_id, day, like_count)
    VALUES (p_artwork_id, CURRENT_DATE, -1)
    ON CONFLICT (artwork_id, day)
    DO UPDATE SET like_count = GREATEST(public.artwork_engagement_daily.like_count - 1, 0);

    RETURN QUERY SELECT FALSE, v_count;
  ELSE
    INSERT INTO public.artwork_likes (artwork_id, user_id)
    VALUES (p_artwork_id, p_user_id);

    UPDATE public.artworks
    SET like_count = like_count + 1
    WHERE id = p_artwork_id
    RETURNING like_count INTO v_count;

    INSERT INTO public.artwork_engagement_daily (artwork_id, day, like_count)
    VALUES (p_artwork_id, CURRENT_DATE, 1)
    ON CONFLICT (artwork_id, day)
    DO UPDATE SET like_count = public.artwork_engagement_daily.like_count + 1;

    RETURN QUERY SELECT TRUE, v_count;
  END IF;
END;
$$;

-- ── increment_artwork_view_count (redefined) ───────────────────────────────────
-- Same signature/behaviour as before (20240201000000_artwork_schema.sql),
-- now additionally rolling the view into today's engagement_daily row.
-- No TypeScript call site changes needed for this one.

CREATE OR REPLACE FUNCTION public.increment_artwork_view_count(p_artwork_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.artworks
  SET view_count = view_count + 1
  WHERE id = p_artwork_id AND deleted_at IS NULL;

  INSERT INTO public.artwork_engagement_daily (artwork_id, day, view_count)
  VALUES (p_artwork_id, CURRENT_DATE, 1)
  ON CONFLICT (artwork_id, day)
  DO UPDATE SET view_count = public.artwork_engagement_daily.view_count + 1;
END;
$$;

-- ── get_artist_daily_earnings ──────────────────────────────────────────────────
-- Zero-filled day-by-day earnings for a full calendar year (365/366 rows,
-- UTC). Earnings are booked on the day the sale credit was recorded
-- (wallet_ledger.created_at) — i.e. the day the order was fulfilled —
-- regardless of hold status, matching "total earnings per day" as a gross
-- revenue figure distinct from the available/pending/hold *balance* split.

CREATE OR REPLACE FUNCTION public.get_artist_daily_earnings(
  p_seller_id UUID,
  p_year      INTEGER
)
RETURNS TABLE (day DATE, amount NUMERIC, sales_count INTEGER)
LANGUAGE sql STABLE AS $$
  WITH days AS (
    SELECT generate_series(
      make_date(p_year, 1, 1),
      make_date(p_year, 12, 31),
      '1 day'::interval
    )::date AS day
  ),
  sales AS (
    SELECT
      (wl.created_at AT TIME ZONE 'UTC')::date AS day,
      SUM(wl.amount) AS amount,
      COUNT(*)::int AS sales_count
    FROM public.wallet_ledger wl
    WHERE wl.user_id = p_seller_id
      AND wl.type = 'CREDIT'
      AND wl.category = 'SALE'
      AND EXTRACT(YEAR FROM (wl.created_at AT TIME ZONE 'UTC')) = p_year
    GROUP BY 1
  )
  SELECT d.day, COALESCE(s.amount, 0) AS amount, COALESCE(s.sales_count, 0) AS sales_count
  FROM days d
  LEFT JOIN sales s ON s.day = d.day
  ORDER BY d.day;
$$;

-- ── get_artist_sales_analytics ─────────────────────────────────────────────────
-- Paginated, filterable, searchable, sortable sale-level feed for an artist's
-- dashboard. One row per order_item this seller sold. total_count is
-- returned on every row via a window function so the caller can read it
-- off row 1 without a second round trip.
--
-- p_status: NULL (all) | 'pending' | 'hold' | 'completed' | 'cancelled'
--   pending   — physical item, not yet delivered
--   hold      — delivered, inside the post-delivery hold window
--   completed — funds available to the artist (digital = instant;
--               physical = delivered and hold window elapsed)
--   cancelled — order/item cancelled, or refunded
-- p_category: NULL (all) | 'SALE' | 'WITHDRAWAL' | 'REFUND' | 'ADJUSTMENT'
--   (WITHDRAWAL/REFUND/ADJUSTMENT rows aren't tied to an order_item, so
--   when p_category is one of those this function sources rows straight
--   from wallet_ledger instead of order_items — see UNION below.)
-- p_sort: 'newest' | 'oldest' | 'highest' | 'lowest'
-- p_search matches order_number, artwork title, or buyer email.

CREATE OR REPLACE FUNCTION public.get_artist_sales_analytics(
  p_seller_id   UUID,
  p_status      TEXT      DEFAULT NULL,
  p_category    TEXT      DEFAULT NULL,
  p_date_from   TIMESTAMPTZ DEFAULT NULL,
  p_date_to     TIMESTAMPTZ DEFAULT NULL,
  p_price_min   NUMERIC   DEFAULT NULL,
  p_price_max   NUMERIC   DEFAULT NULL,
  p_search      TEXT      DEFAULT NULL,
  p_sort        TEXT      DEFAULT 'newest',
  p_limit       INTEGER   DEFAULT 20,
  p_offset      INTEGER   DEFAULT 0
)
RETURNS TABLE (
  ledger_id         UUID,
  order_id          UUID,
  order_item_id     UUID,
  order_number      TEXT,
  artwork_id        UUID,
  artwork_title     TEXT,
  artwork_thumbnail TEXT,
  artwork_description TEXT,
  buyer_id          UUID,
  buyer_name        TEXT,
  amount            NUMERIC,
  currency          TEXT,
  category          TEXT,
  effective_status  TEXT,
  tracking_id       TEXT,
  created_at        TIMESTAMPTZ,
  total_count       BIGINT
)
LANGUAGE sql STABLE AS $$
  WITH base AS (
    SELECT
      wl.id                AS ledger_id,
      wl.order_id,
      wl.order_item_id,
      o.order_number,
      oi.artwork_id,
      oi.artwork_title,
      oi.artwork_thumbnail_url AS artwork_thumbnail,
      a.description         AS artwork_description,
      o.buyer_id,
      u.email                AS buyer_name,
      wl.amount,
      COALESCE(oi.currency, o.currency, 'USDT') AS currency_raw,
      wl.category::text     AS category,
      CASE
        WHEN wl.category <> 'SALE' THEN 'n/a'
        WHEN o.status IN ('CANCELLED', 'REFUNDED') THEN 'cancelled'
        WHEN oip.refund_status = 'COMPLETED' OR oip.delivery_status = 'CANCELLED' THEN 'cancelled'
        WHEN wl.hold_status = 'PENDING_DELIVERY' THEN 'pending'
        WHEN wl.hold_status = 'ON_HOLD' AND wl.available_at > NOW() THEN 'hold'
        ELSE 'completed'
      END AS effective_status,
      oip.tracking_id,
      wl.created_at
    FROM public.wallet_ledger wl
    LEFT JOIN public.orders o                ON o.id = wl.order_id
    LEFT JOIN public.order_items oi          ON oi.id = wl.order_item_id
    LEFT JOIN public.artworks a              ON a.id = oi.artwork_id
    LEFT JOIN public.order_item_physical oip ON oip.order_item_id = wl.order_item_id
    LEFT JOIN public.users u                 ON u.id = o.buyer_id
    WHERE wl.user_id = p_seller_id
  )
  SELECT
    b.ledger_id, b.order_id, b.order_item_id, b.order_number,
    b.artwork_id, b.artwork_title, b.artwork_thumbnail, b.artwork_description,
    b.buyer_id, b.buyer_name, b.amount, b.currency_raw, b.category,
    b.effective_status, b.tracking_id, b.created_at,
    COUNT(*) OVER() AS total_count
  FROM base b
  WHERE (p_status   IS NULL OR b.effective_status = p_status)
    AND (p_category IS NULL OR b.category = p_category)
    AND (p_date_from IS NULL OR b.created_at >= p_date_from)
    AND (p_date_to   IS NULL OR b.created_at <= p_date_to)
    AND (p_price_min IS NULL OR b.amount >= p_price_min)
    AND (p_price_max IS NULL OR b.amount <= p_price_max)
    AND (
      p_search IS NULL
      OR b.order_number ILIKE '%' || p_search || '%'
      OR b.artwork_title ILIKE '%' || p_search || '%'
      OR b.buyer_name ILIKE '%' || p_search || '%'
      OR b.tracking_id ILIKE '%' || p_search || '%'
    )
  ORDER BY
    CASE WHEN p_sort = 'oldest'  THEN b.created_at END ASC,
    CASE WHEN p_sort = 'lowest'  THEN b.amount END ASC,
    CASE WHEN p_sort = 'highest' THEN b.amount END DESC,
    CASE WHEN p_sort NOT IN ('oldest', 'lowest', 'highest') THEN b.created_at END DESC
  LIMIT p_limit OFFSET p_offset;
$$;

-- ── get_artist_artwork_performance ─────────────────────────────────────────────
-- Per-artwork aggregates for a seller within a date window — the building
-- block for "top artwork of the week" (by earnings / sales / engagement)
-- and its period-over-period comparison. The service layer calls this
-- twice (current window, equal-length previous window) and diffs in TS.

CREATE OR REPLACE FUNCTION public.get_artist_artwork_performance(
  p_seller_id    UUID,
  p_window_start TIMESTAMPTZ,
  p_window_end   TIMESTAMPTZ
)
RETURNS TABLE (
  artwork_id     UUID,
  artwork_title  TEXT,
  thumbnail_url  TEXT,
  earnings       NUMERIC,
  sales_count    INTEGER,
  views          INTEGER,
  likes          INTEGER
)
LANGUAGE sql STABLE AS $$
  WITH sales AS (
    SELECT
      oi.artwork_id,
      SUM(wl.amount) AS earnings,
      COUNT(*)::int  AS sales_count
    FROM public.wallet_ledger wl
    JOIN public.order_items oi ON oi.id = wl.order_item_id
    WHERE wl.user_id = p_seller_id
      AND wl.type = 'CREDIT'
      AND wl.category = 'SALE'
      AND wl.created_at >= p_window_start
      AND wl.created_at <  p_window_end
    GROUP BY oi.artwork_id
  ),
  engagement AS (
    SELECT
      aed.artwork_id,
      SUM(aed.view_count)::int AS views,
      SUM(aed.like_count)::int AS likes
    FROM public.artwork_engagement_daily aed
    JOIN public.artworks a ON a.id = aed.artwork_id
    WHERE a.creator_id = p_seller_id
      AND aed.day >= p_window_start::date
      AND aed.day <  p_window_end::date
    GROUP BY aed.artwork_id
  )
  SELECT
    a.id AS artwork_id,
    a.title AS artwork_title,
    (a.assets -> 0 ->> 'thumbnail_url') AS thumbnail_url,
    COALESCE(s.earnings, 0)      AS earnings,
    COALESCE(s.sales_count, 0)   AS sales_count,
    COALESCE(e.views, 0)         AS views,
    COALESCE(e.likes, 0)         AS likes
  FROM public.artworks a
  LEFT JOIN sales s      ON s.artwork_id = a.id
  LEFT JOIN engagement e ON e.artwork_id = a.id
  WHERE a.creator_id = p_seller_id
    AND (s.artwork_id IS NOT NULL OR e.artwork_id IS NOT NULL);
$$;

-- ── get_artist_reliability_stats ───────────────────────────────────────────────
-- Raw counts behind the Artsony Score's "order reliability" component —
-- see ARTSONY_SCORE.md for how these are weighted.

CREATE OR REPLACE FUNCTION public.get_artist_reliability_stats(p_seller_id UUID)
RETURNS TABLE (
  total_physical_items     INTEGER,
  delivered_items          INTEGER,
  delivery_failed_items    INTEGER,
  cancelled_items          INTEGER,
  refunded_items           INTEGER
)
LANGUAGE sql STABLE AS $$
  SELECT
    COUNT(*)::int AS total_physical_items,
    COUNT(*) FILTER (WHERE oip.timeline_status = 'DELIVERED')::int AS delivered_items,
    COUNT(*) FILTER (WHERE oip.timeline_status = 'DELIVERY_FAILED')::int AS delivery_failed_items,
    COUNT(*) FILTER (WHERE oip.delivery_status = 'CANCELLED')::int AS cancelled_items,
    COUNT(*) FILTER (WHERE oip.refund_status = 'COMPLETED')::int AS refunded_items
  FROM public.order_item_physical oip
  JOIN public.order_items oi ON oi.id = oip.order_item_id
  WHERE oi.seller_id = p_seller_id;
$$;

-- ── get_artist_period_metrics ───────────────────────────────────────────────────
-- Consolidated figures for an arbitrary [p_start, p_end) window — the
-- analytics service calls this twice (current window, and an equal-length
-- window immediately preceding it) and diffs the two in TypeScript to
-- produce every "up/down X% vs last <period>" figure on the overview card.

CREATE OR REPLACE FUNCTION public.get_artist_period_metrics(
  p_seller_id UUID,
  p_start     TIMESTAMPTZ,
  p_end       TIMESTAMPTZ
)
RETURNS TABLE (
  earnings          NUMERIC,
  sales_count       INTEGER,
  withdrawals       NUMERIC,
  views             INTEGER,
  likes             INTEGER
)
LANGUAGE sql STABLE AS $$
  SELECT
    COALESCE((
      SELECT SUM(wl.amount) FROM public.wallet_ledger wl
      WHERE wl.user_id = p_seller_id AND wl.type = 'CREDIT' AND wl.category = 'SALE'
        AND wl.created_at >= p_start AND wl.created_at < p_end
    ), 0) AS earnings,
    COALESCE((
      SELECT COUNT(*)::int FROM public.wallet_ledger wl
      WHERE wl.user_id = p_seller_id AND wl.type = 'CREDIT' AND wl.category = 'SALE'
        AND wl.created_at >= p_start AND wl.created_at < p_end
    ), 0) AS sales_count,
    COALESCE((
      SELECT SUM(wl.amount) FROM public.wallet_ledger wl
      JOIN public.withdrawal_requests wr ON wr.id = wl.withdrawal_request_id
      WHERE wl.user_id = p_seller_id AND wl.type = 'DEBIT' AND wl.category = 'WITHDRAWAL'
        AND wr.status = 'COMPLETED'
        AND wl.created_at >= p_start AND wl.created_at < p_end
    ), 0) AS withdrawals,
    COALESCE((
      SELECT SUM(aed.view_count)::int FROM public.artwork_engagement_daily aed
      JOIN public.artworks a ON a.id = aed.artwork_id
      WHERE a.creator_id = p_seller_id
        AND aed.day >= p_start::date AND aed.day < p_end::date
    ), 0) AS views,
    COALESCE((
      SELECT SUM(aed.like_count)::int FROM public.artwork_engagement_daily aed
      JOIN public.artworks a ON a.id = aed.artwork_id
      WHERE a.creator_id = p_seller_id
        AND aed.day >= p_start::date AND aed.day < p_end::date
    ), 0) AS likes;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- RLS (service role bypasses — deny-all protects anon/authenticated access)
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.withdrawal_requests       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_reviews             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artwork_likes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artwork_engagement_daily  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_all_withdrawal_requests"      ON public.withdrawal_requests      USING (FALSE);
CREATE POLICY "deny_all_order_reviews"            ON public.order_reviews            USING (FALSE);
CREATE POLICY "deny_all_artwork_likes"            ON public.artwork_likes            USING (FALSE);
CREATE POLICY "deny_all_artwork_engagement_daily" ON public.artwork_engagement_daily USING (FALSE);
