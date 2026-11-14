-- Who cancelled an order, and when.
--
-- Orders that are cancelled before payment (buyer cancels, or the payment window
-- expires) never get an order_item_physical row, so they have no timeline events
-- either. Until now nothing recorded the actor or the time, so My Orders could
-- not show "Canceled By" / "Canceled Date" for them.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cancelled_by TEXT
    CHECK (cancelled_by IN ('buyer', 'artist', 'admin', 'system')),
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- Backfill the time for orders that are already closed. The actor cannot be
-- recovered reliably (a buyer cancelling and the expiry job both leave the
-- transaction EXPIRED), so cancelled_by stays NULL for them and shows as "—".
-- The updated_at trigger is paused so the backfill does not bump updated_at.
ALTER TABLE public.orders DISABLE TRIGGER order_updated_at;

UPDATE public.orders
SET    cancelled_at = updated_at
WHERE  status IN ('CANCELLED', 'REFUNDED')
  AND  cancelled_at IS NULL;

ALTER TABLE public.orders ENABLE TRIGGER order_updated_at;
