-- ═══════════════════════════════════════════════════════════════════════════
-- Order Receipts + Admin Filtering Indexes
-- Adds: order_receipts table (payment confirmation, distinct from invoice),
--       indexes needed for artist_id/buyer_id/order_number filtering on the
--       admin physical-order list.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── order_receipts ────────────────────────────────────────────────────────────
-- A receipt is proof-of-payment: simpler than an invoice, generated once at
-- payment confirmation. An invoice (order_invoices) is the itemized document
-- detailing goods/services, agreed prices, and payment terms, and can be
-- regenerated (new version) on refund or admin request. These are
-- intentionally separate documents with separate storage and lifecycles.

CREATE TABLE IF NOT EXISTS public.order_receipts (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                 UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  pdf_cloudinary_public_id TEXT NOT NULL,
  pdf_url                  TEXT NOT NULL,
  amount_paid              NUMERIC(12,2) NOT NULL,
  currency                 TEXT NOT NULL DEFAULT 'USDT',
  payment_method           TEXT NOT NULL,
  transaction_reference    TEXT,
  generated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_by             UUID NOT NULL,

  -- A receipt is issued exactly once per order — it documents the payment
  -- event itself, not the goods. Unlike invoices it is never re-versioned.
  CONSTRAINT order_receipt_order_unique UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS idx_or_order_id ON public.order_receipts (order_id);

ALTER TABLE public.order_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_or" ON public.order_receipts USING (false);

-- ── Indexes for admin physical-order filtering ────────────────────────────────
-- order_item_physical does not itself carry artist_id/buyer_id — those live
-- on order_items.seller_id and orders.buyer_id respectively. The admin list
-- filters by joining through order_item_id / order_id, so we index the join
-- columns used by those lookups.

CREATE INDEX IF NOT EXISTS idx_order_items_seller_id ON public.order_items (seller_id);
CREATE INDEX IF NOT EXISTS idx_orders_buyer_id_lookup ON public.orders (buyer_id);

-- order_number is already UNIQUE-indexed from the prior migration; this adds
-- a case-insensitive lookup path since order numbers may be pasted with
-- inconsistent casing by support staff.
CREATE INDEX IF NOT EXISTS idx_orders_order_number_ci ON public.orders (upper(order_number));