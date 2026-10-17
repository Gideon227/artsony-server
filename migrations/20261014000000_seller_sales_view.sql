-- Seller sales lines: one row per order_item, with seller-scoped amounts,
-- a seller-facing status bucket, buyer display name and a searchable text column.
-- Unpaid orders (PENDING_PAYMENT) are excluded: a seller has no sale until payment confirms.

CREATE INDEX IF NOT EXISTS idx_order_items_seller_created
  ON public.order_items (seller_id, created_at DESC);

CREATE OR REPLACE VIEW public.seller_sales_view AS
SELECT
  oi.id AS order_item_id,
  oi.order_id,
  oi.seller_id,
  o.buyer_id,
  oip.id AS physical_id,
  COALESCE(
    o.order_number,
    'AR-' || upper(left(replace(o.id::text, '-', ''), 8))
  ) AS order_code,
  'AR-' || upper(left(replace(o.id::text, '-', ''), 8)) AS legacy_code,
  oi.artwork_id,
  oi.artwork_title,
  oi.artwork_thumbnail_url,
  oi.artwork_format,
  oi.quantity,
  oi.unit_price,
  oi.line_total,
  oi.currency,
  COALESCE(
    NULLIF(btrim(o.shipping_address ->> 'full_name'), ''),
    NULLIF(btrim(p.display_name), ''),
    NULLIF(btrim(p.username), ''),
    'Buyer #' || left(o.buyer_id::text, 8)
  ) AS buyer_name,
  o.status AS order_status,
  oip.timeline_status,
  oip.delivery_status,
  CASE
    WHEN o.status IN ('CANCELLED', 'REFUNDED')
      OR oip.delivery_status = 'CANCELLED' THEN 'CANCELLED'
    WHEN oip.delivery_status = 'DELIVERED' THEN 'COMPLETED'
    WHEN oi.artwork_format = 'DIGITAL' THEN 'COMPLETED'
    WHEN oip.id IS NULL THEN 'PENDING'
    WHEN oip.timeline_status IN (
      'ORDER_RECEIVED', 'ORDER_RECEIVED_ACTIVE',
      'AWAITING_CONFIRMATION', 'AWAITING_CONFIRMATION_ACTIVE'
    ) THEN 'PENDING'
    ELSE 'LIVE'
  END AS seller_status,
  oi.created_at AS purchased_at,
  lower(concat_ws(' ',
    o.order_number,
    'AR-' || upper(left(replace(o.id::text, '-', ''), 8)),
    oi.artwork_title,
    COALESCE(
      NULLIF(btrim(o.shipping_address ->> 'full_name'), ''),
      NULLIF(btrim(p.display_name), ''),
      NULLIF(btrim(p.username), '')
    )
  )) AS search_text
FROM public.order_items oi
JOIN public.orders o ON o.id = oi.order_id
LEFT JOIN public.order_item_physical oip ON oip.order_item_id = oi.id
LEFT JOIN public.profiles p ON p.user_id = o.buyer_id
WHERE o.status <> 'PENDING_PAYMENT';

ALTER VIEW public.seller_sales_view SET (security_invoker = true);

REVOKE ALL ON public.seller_sales_view FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.seller_sales_view TO service_role;
