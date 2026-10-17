-- ═══════════════════════════════════════════════════════════════════════════
-- Artsony Studio — analytics correctness fixes
-- Migration: 20261013000000_studio_analytics_fixes.sql
--
-- Requires 20240901000000_analytics_wallet_reviews_schema.sql to be applied
-- (run 20260930000000_studio_diagnostics.sql first to confirm).
-- Idempotent: CREATE OR REPLACE only, no return-type changes.
--
--   1. get_artist_period_metrics / get_artist_artwork_performance
--      Engagement (views/likes) is stored per UTC day while earnings are
--      stored per timestamp. The old filter `day < p_end::date` dropped the
--      day containing p_end, so today's views/likes were never counted and
--      views/likes lagged earnings by a day (which also skewed conversion
--      rate = sales / views). Windows are now evaluated on whole UTC days.
--   2. total withdrawals are bucketed by when the payout COMPLETED, not by
--      when the reservation debit was written.
--   3. get_artist_daily_series — zero-filled per-day earnings, sales, views
--      and likes for an arbitrary range; backs the Stats mini charts.
--   4. get_artist_sales_analytics — buyer_name was users.email, leaking buyer
--      emails to sellers. Now the buyer's display name / username.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── get_artist_period_metrics ───────────────────────────────────────────────

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
  WITH bounds AS (
    SELECT
      (p_start AT TIME ZONE 'UTC')::date                                       AS first_day,
      (((p_end AT TIME ZONE 'UTC') - INTERVAL '1 microsecond')::date + 1)      AS end_day_exclusive
  )
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
      SELECT SUM(wr.amount) FROM public.withdrawal_requests wr
      WHERE wr.user_id = p_seller_id AND wr.status = 'COMPLETED'
        AND wr.completed_at >= p_start AND wr.completed_at < p_end
    ), 0) AS withdrawals,
    COALESCE((
      SELECT SUM(aed.view_count)::int
      FROM public.artwork_engagement_daily aed
      JOIN public.artworks a ON a.id = aed.artwork_id
      CROSS JOIN bounds b
      WHERE a.creator_id = p_seller_id
        AND aed.day >= b.first_day AND aed.day < b.end_day_exclusive
    ), 0) AS views,
    COALESCE((
      SELECT SUM(aed.like_count)::int
      FROM public.artwork_engagement_daily aed
      JOIN public.artworks a ON a.id = aed.artwork_id
      CROSS JOIN bounds b
      WHERE a.creator_id = p_seller_id
        AND aed.day >= b.first_day AND aed.day < b.end_day_exclusive
    ), 0) AS likes;
$$;

-- ── get_artist_artwork_performance ──────────────────────────────────────────

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
  WITH bounds AS (
    SELECT
      (p_window_start AT TIME ZONE 'UTC')::date                                     AS first_day,
      (((p_window_end AT TIME ZONE 'UTC') - INTERVAL '1 microsecond')::date + 1)    AS end_day_exclusive
  ),
  sales AS (
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
    CROSS JOIN bounds b
    WHERE a.creator_id = p_seller_id
      AND aed.day >= b.first_day
      AND aed.day <  b.end_day_exclusive
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
    AND a.deleted_at IS NULL
    AND (s.artwork_id IS NOT NULL OR e.artwork_id IS NOT NULL);
$$;

-- ── get_artist_daily_series ─────────────────────────────────────────────────
-- One row per UTC day in [p_from, p_to] inclusive, zero-filled.
-- Capped at 400 days so a bad caller cannot request an unbounded series.

CREATE OR REPLACE FUNCTION public.get_artist_daily_series(
  p_seller_id UUID,
  p_from      DATE,
  p_to        DATE
)
RETURNS TABLE (day DATE, amount NUMERIC, sales_count INTEGER, views INTEGER, likes INTEGER)
LANGUAGE sql STABLE AS $$
  WITH days AS (
    SELECT d::date AS day
    FROM generate_series(p_from, LEAST(p_to, p_from + 399), INTERVAL '1 day') AS d
  ),
  sales AS (
    SELECT
      (wl.created_at AT TIME ZONE 'UTC')::date AS day,
      SUM(wl.amount)  AS amount,
      COUNT(*)::int   AS sales_count
    FROM public.wallet_ledger wl
    WHERE wl.user_id = p_seller_id
      AND wl.type = 'CREDIT'
      AND wl.category = 'SALE'
      AND (wl.created_at AT TIME ZONE 'UTC')::date BETWEEN p_from AND LEAST(p_to, p_from + 399)
    GROUP BY 1
  ),
  engagement AS (
    SELECT
      aed.day,
      SUM(aed.view_count)::int AS views,
      SUM(aed.like_count)::int AS likes
    FROM public.artwork_engagement_daily aed
    JOIN public.artworks a ON a.id = aed.artwork_id
    WHERE a.creator_id = p_seller_id
      AND aed.day BETWEEN p_from AND LEAST(p_to, p_from + 399)
    GROUP BY aed.day
  )
  SELECT
    d.day,
    COALESCE(s.amount, 0)       AS amount,
    COALESCE(s.sales_count, 0)  AS sales_count,
    COALESCE(e.views, 0)        AS views,
    COALESCE(e.likes, 0)        AS likes
  FROM days d
  LEFT JOIN sales s      ON s.day = d.day
  LEFT JOIN engagement e ON e.day = d.day
  ORDER BY d.day;
$$;

-- ── get_artist_sales_analytics ──────────────────────────────────────────────
-- Identical to the original except buyer_name no longer exposes users.email
-- (users.username can itself default to the email, so '@' values are masked).

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
      COALESCE(
        NULLIF(p.display_name, ''),
        CASE WHEN u.username LIKE '%@%' THEN NULL ELSE u.username END,
        'Artsony buyer'
      ) AS buyer_name,
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
    LEFT JOIN public.profiles p              ON p.user_id = o.buyer_id
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