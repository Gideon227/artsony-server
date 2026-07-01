-- ═══════════════════════════════════════════════════════════════════════════
-- Physical Order Pipeline Migration
-- Adds: order_number, physical pipeline tables, timeline, delivery proof,
--       invoices, refund requests, role enforcement, and auto-cancel job support.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Extensions ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Enums ─────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE timeline_status AS ENUM (
    'ORDER_RECEIVED',
    'ORDER_RECEIVED_ACTIVE',
    'AWAITING_CONFIRMATION',
    'AWAITING_CONFIRMATION_ACTIVE',
    'ORDER_FAILED_TO_CONFIRM',
    'AWAITING_PICKUP',
    'AWAITING_PICKUP_ACTIVE',
    'PICKUP_FAILED',
    'COURIER_REJECTED_PICKUP',
    'PICKED_UP',
    'PICKED_UP_ACTIVE',
    'IN_TRANSIT',
    'IN_TRANSIT_ACTIVE',
    'DELAYED_DELIVERY',
    'OUT_FOR_DELIVERY',
    'OUT_FOR_DELIVERY_ACTIVE',
    'DELIVERED',
    'DELIVERY_FAILED'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE delivery_status AS ENUM ('LIVE', 'DELIVERED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE refund_status AS ENUM (
    'NONE', 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'PARTIAL'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE courier_service_type AS ENUM (
    'STANDARD', 'EXPRESS', 'OVERNIGHT', 'ECONOMY'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE timeline_actor_role AS ENUM (
    'buyer', 'artist', 'admin', 'system', 'courier'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE refund_request_status AS ENUM (
    'PENDING_ADMIN', 'APPROVED', 'REJECTED'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE invoice_trigger AS ENUM (
    'order_created', 'refund_processed', 'admin_request'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ── Add order_number to orders table ──────────────────────────────────────────
-- Collision-safe: DB unique constraint + service-layer retry on conflict.
-- Format: AR- + 8 uppercase alphanumeric chars.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_number VARCHAR(20) UNIQUE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_order_number
  ON public.orders (order_number)
  WHERE order_number IS NOT NULL;

-- ── Add role column to users ─────────────────────────────────────────────────
-- Role is enforced server-side via JWT and DB check trigger.
-- The trigger below prevents self-promotion via direct SQL.

DO $$ BEGIN
  CREATE TYPE user_role_new AS ENUM ('USER', 'ARTIST', 'MODERATOR', 'ADMIN');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Only add if column doesn't exist already
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'USER'
  CHECK (role IN ('USER', 'ARTIST', 'MODERATOR', 'ADMIN'));

-- ── Role self-promotion prevention trigger ────────────────────────────────────
-- Users cannot elevate their own role. Only ADMIN can change roles.
-- This is defence-in-depth on top of service-layer checks.

CREATE OR REPLACE FUNCTION public.prevent_self_role_promotion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- If role is being changed and the session user is not the service role
  -- (service role = our backend), reject it.
  -- In practice, all mutations go through the service role which bypasses RLS,
  -- but this acts as a last-resort guard for any direct DB access attempts.
  IF NEW.role <> OLD.role THEN
    -- Allow service role (our backend) to change roles freely.
    -- Block any other principal.
    IF current_user NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
      RAISE EXCEPTION 'role_change_forbidden: direct role changes are not allowed'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_role_self_promotion ON public.users;
CREATE TRIGGER trg_prevent_role_self_promotion
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.prevent_self_role_promotion();

-- ── order_item_physical ───────────────────────────────────────────────────────
-- One row per physical order_item. Created by the system when payment confirms.

CREATE TABLE IF NOT EXISTS public.order_item_physical (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id             UUID NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  order_id                  UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  timeline_status           timeline_status NOT NULL DEFAULT 'ORDER_RECEIVED',
  delivery_status           delivery_status NOT NULL DEFAULT 'LIVE',
  -- Shipping
  shipping_cost             NUMERIC(12,2),
  courier_name              TEXT,
  courier_service_type      courier_service_type,
  tracking_id               TEXT,
  estimated_delivery_date   DATE,
  pickup_address            TEXT,
  -- Refund
  refund_status             refund_status NOT NULL DEFAULT 'NONE',
  refund_amount             NUMERIC(12,2),
  refund_initiated_at       TIMESTAMPTZ,
  refund_completed_at       TIMESTAMPTZ,
  refund_notes              TEXT,
  -- Timestamps
  confirmed_at              TIMESTAMPTZ,
  picked_up_at              TIMESTAMPTZ,
  in_transit_at             TIMESTAMPTZ,
  delivered_at              TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT order_item_physical_item_unique UNIQUE (order_item_id)
);

CREATE INDEX IF NOT EXISTS idx_oip_order_id       ON public.order_item_physical (order_id);
CREATE INDEX IF NOT EXISTS idx_oip_timeline       ON public.order_item_physical (timeline_status);
CREATE INDEX IF NOT EXISTS idx_oip_delivery       ON public.order_item_physical (delivery_status);
CREATE INDEX IF NOT EXISTS idx_oip_refund         ON public.order_item_physical (refund_status);
CREATE INDEX IF NOT EXISTS idx_oip_tracking       ON public.order_item_physical (tracking_id) WHERE tracking_id IS NOT NULL;

CREATE TRIGGER oip_updated_at
  BEFORE UPDATE ON public.order_item_physical
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── order_timeline_events ─────────────────────────────────────────────────────
-- Append-only event log. No UPDATE, no DELETE from application layer.
-- Every timeline state change produces exactly one row.

CREATE TABLE IF NOT EXISTS public.order_timeline_events (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_physical_id  UUID NOT NULL REFERENCES public.order_item_physical(id) ON DELETE CASCADE,
  order_id                UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id           UUID NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  timeline_status         timeline_status NOT NULL,
  is_pending              BOOLEAN NOT NULL DEFAULT false,
  actor_id                UUID,           -- NULL for system events
  actor_role              timeline_actor_role NOT NULL DEFAULT 'system',
  notes                   TEXT,
  metadata                JSONB NOT NULL DEFAULT '{}',
  occurred_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ote_physical_id ON public.order_timeline_events (order_item_physical_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_ote_order_id    ON public.order_timeline_events (order_id, occurred_at DESC);

-- Immutability enforcement at DB level
CREATE OR REPLACE RULE order_timeline_no_update AS ON UPDATE TO public.order_timeline_events DO INSTEAD NOTHING;
CREATE OR REPLACE RULE order_timeline_no_delete AS ON DELETE TO public.order_timeline_events DO INSTEAD NOTHING;

-- ── order_delivery_proofs ────────────────────────────────────────────────────
-- Immutable per row — couriers/admins upload proof images after delivery.

CREATE TABLE IF NOT EXISTS public.order_delivery_proofs (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_physical_id  UUID NOT NULL REFERENCES public.order_item_physical(id) ON DELETE CASCADE,
  order_id                UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  cloudinary_public_id    TEXT NOT NULL,
  secure_url              TEXT NOT NULL,
  mime_type               TEXT NOT NULL,
  file_size_bytes         INTEGER NOT NULL,
  uploaded_by             UUID NOT NULL,
  uploader_role           TEXT NOT NULL CHECK (uploader_role IN ('admin', 'courier')),
  uploaded_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Enforce max 5 delivery proofs per item (replaces CHECK, since subqueries
-- ── aren't allowed in CHECK constraints) ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enforce_max_delivery_proofs()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
    FROM public.order_delivery_proofs
    WHERE order_item_physical_id = NEW.order_item_physical_id;

  IF v_count >= 5 THEN
    RAISE EXCEPTION 'delivery_proof_limit_exceeded: max 5 proofs per order_item_physical_id'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_max_delivery_proofs ON public.order_delivery_proofs;
CREATE TRIGGER trg_enforce_max_delivery_proofs
  BEFORE INSERT ON public.order_delivery_proofs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_max_delivery_proofs();

CREATE INDEX IF NOT EXISTS idx_odp_physical_id ON public.order_delivery_proofs (order_item_physical_id);
CREATE INDEX IF NOT EXISTS idx_odp_order_id    ON public.order_delivery_proofs (order_id);

-- Immutability
CREATE OR REPLACE RULE delivery_proof_no_update AS ON UPDATE TO public.order_delivery_proofs DO INSTEAD NOTHING;
CREATE OR REPLACE RULE delivery_proof_no_delete AS ON DELETE TO public.order_delivery_proofs DO INSTEAD NOTHING;

-- ── order_invoices ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.order_invoices (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                 UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  version                  INTEGER NOT NULL DEFAULT 1,
  pdf_cloudinary_public_id TEXT NOT NULL,
  pdf_url                  TEXT NOT NULL,
  generated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_by             UUID NOT NULL,
  trigger                  invoice_trigger NOT NULL DEFAULT 'order_created',

  CONSTRAINT order_invoice_version_unique UNIQUE (order_id, version)
);

CREATE INDEX IF NOT EXISTS idx_oi_order_id ON public.order_invoices (order_id, version DESC);

-- ── order_refund_requests ────────────────────────────────────────────────────
-- Artists request refunds; admins approve or reject.

CREATE TABLE IF NOT EXISTS public.order_refund_requests (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_physical_id  UUID NOT NULL REFERENCES public.order_item_physical(id) ON DELETE CASCADE,
  order_id                UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  requested_by            UUID NOT NULL,     -- artist user id
  reason                  TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 2000),
  status                  refund_request_status NOT NULL DEFAULT 'PENDING_ADMIN',
  admin_notes             TEXT,
  reviewed_by             UUID,
  reviewed_at             TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orr_physical_id ON public.order_refund_requests (order_item_physical_id);
CREATE INDEX IF NOT EXISTS idx_orr_order_id    ON public.order_refund_requests (order_id);
CREATE INDEX IF NOT EXISTS idx_orr_status      ON public.order_refund_requests (status);

-- ── RPC: generate_order_number ────────────────────────────────────────────────
-- Called by the application after order creation.
-- Returns a guaranteed-unique AR-XXXXXXXX string.
-- Retries up to 10 times in case of collision (astronomically unlikely).

CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE
  chars   TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- 32-char set, no I/1/O/0
  result  TEXT;
  i       INT;
  attempt INT := 0;
BEGIN
  LOOP
    result := 'AR-';
    FOR i IN 1..8 LOOP
      result := result || substr(chars, (floor(random() * 32)::int + 1), 1);
    END LOOP;

    -- Check uniqueness
    IF NOT EXISTS (SELECT 1 FROM public.orders WHERE order_number = result) THEN
      RETURN result;
    END IF;

    attempt := attempt + 1;
    IF attempt >= 10 THEN
      RAISE EXCEPTION 'order_number_generation_failed: too many collisions';
    END IF;
  END LOOP;
END;
$$;

-- ── RPC: assign_order_number ──────────────────────────────────────────────────
-- Sets order_number on an order atomically if not already set.

CREATE OR REPLACE FUNCTION public.assign_order_number(p_order_id UUID)
RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE
  v_number TEXT;
BEGIN
  -- Idempotent: return existing number if already assigned
  SELECT order_number INTO v_number FROM public.orders WHERE id = p_order_id;
  IF v_number IS NOT NULL THEN
    RETURN v_number;
  END IF;

  v_number := public.generate_order_number();

  UPDATE public.orders SET order_number = v_number WHERE id = p_order_id;
  RETURN v_number;
END;
$$;

-- ── RPC: transition_item_timeline ─────────────────────────────────────────────
-- Atomically updates order_item_physical.timeline_status and appends a
-- timeline event. This prevents split-brain between the two tables.

CREATE OR REPLACE FUNCTION public.transition_item_timeline(
  p_physical_id     UUID,
  p_new_status      timeline_status,
  p_is_pending      BOOLEAN,
  p_actor_id        UUID,
  p_actor_role      timeline_actor_role,
  p_notes           TEXT,
  p_metadata        JSONB
)
RETURNS UUID   -- returns the new timeline event id
LANGUAGE plpgsql AS $$
DECLARE
  v_order_id      UUID;
  v_order_item_id UUID;
  v_event_id      UUID;
BEGIN
  SELECT order_id, order_item_id
    INTO v_order_id, v_order_item_id
    FROM public.order_item_physical
    WHERE id = p_physical_id
    FOR UPDATE;    -- row-level lock prevents concurrent transitions

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_item_physical_not_found: %', p_physical_id;
  END IF;

  -- Update physical record
  UPDATE public.order_item_physical
    SET
      timeline_status = p_new_status,
      -- Delivery status grouping
      delivery_status = CASE
        WHEN p_new_status = 'DELIVERED'           THEN 'DELIVERED'::delivery_status
        WHEN p_new_status IN ('ORDER_FAILED_TO_CONFIRM','DELIVERY_FAILED') THEN 'CANCELLED'::delivery_status
        ELSE delivery_status
      END,
      -- Milestone timestamps
      confirmed_at   = CASE WHEN p_new_status = 'AWAITING_CONFIRMATION_ACTIVE' AND confirmed_at IS NULL
                            THEN NOW() ELSE confirmed_at END,
      picked_up_at   = CASE WHEN p_new_status = 'PICKED_UP_ACTIVE' AND picked_up_at IS NULL
                            THEN NOW() ELSE picked_up_at END,
      in_transit_at  = CASE WHEN p_new_status = 'IN_TRANSIT_ACTIVE' AND in_transit_at IS NULL
                            THEN NOW() ELSE in_transit_at END,
      delivered_at   = CASE WHEN p_new_status = 'DELIVERED' AND delivered_at IS NULL
                            THEN NOW() ELSE delivered_at END,
      updated_at     = NOW()
    WHERE id = p_physical_id;

  -- Append immutable event
  INSERT INTO public.order_timeline_events (
    order_item_physical_id, order_id, order_item_id,
    timeline_status, is_pending,
    actor_id, actor_role, notes, metadata
  ) VALUES (
    p_physical_id, v_order_id, v_order_item_id,
    p_new_status, p_is_pending,
    p_actor_id, p_actor_role, p_notes, COALESCE(p_metadata, '{}')
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

-- ── RLP policies (deny all anon/authenticated — service role bypasses) ────────

ALTER TABLE public.order_item_physical    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_timeline_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_delivery_proofs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_invoices         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_refund_requests  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_all_oip"   ON public.order_item_physical    USING (false);
CREATE POLICY "deny_all_ote"   ON public.order_timeline_events  USING (false);
CREATE POLICY "deny_all_odp"   ON public.order_delivery_proofs  USING (false);
CREATE POLICY "deny_all_oi"    ON public.order_invoices         USING (false);
CREATE POLICY "deny_all_orr"   ON public.order_refund_requests  USING (false);

-- ── Indexes for search/filter performance ────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_orders_created_at   ON public.orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_buyer_status ON public.orders (buyer_id, status);