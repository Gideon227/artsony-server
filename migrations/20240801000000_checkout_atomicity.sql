-- ═══════════════════════════════════════════════════════════════════════════
-- Artsony — Checkout Atomicity + Shipping Address Default Handling
-- ═══════════════════════════════════════════════════════════════════════════

-- ── create_order_with_items ─────────────────────────────────────────────────
-- Replaces three sequential client-side inserts (orders -> order_items ->
-- transactions) with a single SECURITY DEFINER function call. Because all
-- three inserts now run inside one PL/pgSQL function invocation, a failure
-- on any statement (including the idempotency_key unique violation) rolls
-- back the entire call — no orphaned order row, no partial order_items.
--
-- p_items is a JSONB array of:
--   { artwork_id, seller_id, artwork_title, artwork_slug,
--     artwork_thumbnail_url, artwork_format, unit_price, currency,
--     quantity, variant_snapshot }
--
-- On a duplicate idempotency_key, this raises the same 23505 the previous
-- three-insert version did — the JS layer already distinguishes this from
-- other failures and is being updated to translate it into "return the
-- existing order" instead of a generic 500.

CREATE OR REPLACE FUNCTION public.create_order_with_items(
  p_buyer_id         UUID,
  p_subtotal         NUMERIC,
  p_currency         VARCHAR,
  p_shipping_address JSONB,
  p_idempotency_key  UUID,
  p_notes            TEXT,
  p_items            JSONB,
  p_tx_amount        NUMERIC,
  p_tx_currency      VARCHAR,
  p_tx_network       wallet_network,
  p_tx_recipient     TEXT,
  p_tx_expires_at    TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_order       public.orders%ROWTYPE;
  v_transaction public.transactions%ROWTYPE;
  v_item        JSONB;
  v_inserted    public.order_items%ROWTYPE;
  v_items       JSONB := '[]'::JSONB;
BEGIN
  INSERT INTO public.orders (
    buyer_id, subtotal, currency, shipping_address,
    idempotency_key, notes, status
  ) VALUES (
    p_buyer_id, p_subtotal, p_currency, p_shipping_address,
    p_idempotency_key, p_notes, 'PENDING_PAYMENT'
  )
  RETURNING * INTO v_order;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO public.order_items (
      order_id, artwork_id, seller_id, artwork_title, artwork_slug,
      artwork_thumbnail_url, artwork_format, unit_price, currency,
      quantity, variant_snapshot
    ) VALUES (
      v_order.id,
      (v_item->>'artwork_id')::UUID,
      (v_item->>'seller_id')::UUID,
      v_item->>'artwork_title',
      v_item->>'artwork_slug',
      v_item->>'artwork_thumbnail_url',
      v_item->>'artwork_format',
      (v_item->>'unit_price')::NUMERIC,
      v_item->>'currency',
      (v_item->>'quantity')::INTEGER,
      v_item->'variant_snapshot'
    )
    RETURNING * INTO v_inserted;

    v_items := v_items || jsonb_build_array(to_jsonb(v_inserted.*));
  END LOOP;

  INSERT INTO public.transactions (
    order_id, amount, currency, network,
    recipient_wallet_address, expires_at, status
  ) VALUES (
    v_order.id, p_tx_amount, p_tx_currency, p_tx_network,
    p_tx_recipient, p_tx_expires_at, 'PENDING'
  )
  RETURNING * INTO v_transaction;

  RETURN jsonb_build_object(
    'order',       to_jsonb(v_order.*),
    'items',       v_items,
    'transaction', to_jsonb(v_transaction.*)
  );
END;
$$;

-- ── set_default_shipping_address ────────────────────────────────────────────
-- idx_shipping_addresses_default enforces at most one is_default=TRUE row
-- per user. Flipping the flag on a new address therefore requires clearing
-- the old default first — two statements that must commit together or not
-- at all, otherwise a crash between them leaves a user with either zero or
-- two defaults. Wrapping both in one function makes the swap atomic.

CREATE OR REPLACE FUNCTION public.set_default_shipping_address(
  p_user_id    UUID,
  p_address_id UUID
)
RETURNS SETOF public.shipping_addresses
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.shipping_addresses
    WHERE id = p_address_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Shipping address not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.shipping_addresses
  SET is_default = FALSE, updated_at = NOW()
  WHERE user_id = p_user_id AND is_default = TRUE AND id <> p_address_id;

  RETURN QUERY
    UPDATE public.shipping_addresses
    SET is_default = TRUE, updated_at = NOW()
    WHERE id = p_address_id AND user_id = p_user_id
    RETURNING *;
END;
$$;
