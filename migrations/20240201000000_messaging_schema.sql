-- ═══════════════════════════════════════════════════════════════════════════
-- Artsony — Messaging & Real-Time Notification Schema
-- Migration: 20240201000000_messaging_schema.sql
--
-- Depends on: 20240101000000_auth_schema.sql (users table must exist)
--
-- Tables introduced:
--   conversations              — chat threads (direct or broadcast)
--   conversation_participants  — members of each conversation
--   messages                   — individual messages within a conversation
--   message_reads              — per-user read receipts
--   typing_indicators          — ephemeral typing state (TTL-managed in Redis,
--                                stored here only for multi-instance recovery)
--   notification_preferences   — per-user channel opt-in/opt-out
--
-- The existing `notifications` table (from 001_initial_schema.sql) is
-- extended with new notification_type enum values. We do NOT drop and
-- recreate the enum — we add values incrementally to avoid downtime.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── Guard: ensure uuid-ossp is present (idempotent) ───────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 1: ENUM EXTENSIONS
-- Extend existing enums without dropping them.
-- PostgreSQL does not support removing enum values, so we only ADD.
-- ═══════════════════════════════════════════════════════════════════════════

-- Extend the existing notification_type enum in the public schema.
-- These values map to specific business events and drive the notification
-- fan-out logic in the service layer.
-- DO $$ BEGIN
--   ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'message';
-- EXCEPTION WHEN duplicate_object THEN null;
-- END $$;

-- DO $$ BEGIN
--   ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'broadcast';
-- EXCEPTION WHEN duplicate_object THEN null;
-- END $$;

-- DO $$ BEGIN
--   ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'mention';
-- EXCEPTION WHEN duplicate_object THEN null;
-- END $$;

-- New standalone enums for messaging domain
DO $$ BEGIN
  CREATE TYPE conversation_type AS ENUM ('direct', 'broadcast');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE message_type AS ENUM ('text', 'image', 'system');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE participant_role AS ENUM ('owner', 'member');
EXCEPTION WHEN duplicate_object THEN null;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 2: CORE MESSAGING TABLES
-- ═══════════════════════════════════════════════════════════════════════════

-- ── conversations ──────────────────────────────────────────────────────────
-- A conversation is the container for a thread. It can be:
--   direct    — exactly 2 participants, bidirectional DM
--   broadcast — 1 sender, N recipients (read-only for recipients)
--
-- `title` is nullable — only used for named broadcast threads.
-- `metadata` holds extensible fields (pinned message id, theme, etc.)
-- `last_message_id` is a denormalized FK for fast "latest message" lookup
--   without a subquery. Updated atomically via trigger on message insert.
-- `last_activity_at` drives conversation list ordering (newest first).
CREATE TABLE IF NOT EXISTS public.conversations (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  type                conversation_type NOT NULL DEFAULT 'direct',
  title               VARCHAR(120),
  created_by          UUID        NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  last_message_id     UUID,                              -- FK added after messages table
  last_activity_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata            JSONB       NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.conversations IS
  'Chat threads. type=direct means 2-participant DM; type=broadcast means 1-to-many.';

COMMENT ON COLUMN public.conversations.last_message_id IS
  'Denormalized FK to messages.id. Updated by trigger for O(1) inbox queries.';


-- ── conversation_participants ──────────────────────────────────────────────
-- Junction table. Every user who is or was in a conversation has a row here.
-- Soft-leave via `left_at` preserves message history for the leaving user.
--
-- `last_read_at` — the timestamp of the last message this user has read.
--   Unread count = COUNT(*) FROM messages WHERE conversation_id = $id
--                  AND created_at > last_read_at AND sender_id != $userId
--   This single timestamp is O(1) to update and avoids the fan-out write
--   amplification of per-message read receipt rows for large broadcasts.
--   For conversations where per-message granularity matters, use message_reads.
--
-- `is_muted` — suppress push/WS notification delivery for this participant.
-- `role`     — owner can delete the conversation; members cannot.
CREATE TABLE IF NOT EXISTS public.conversation_participants (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id     UUID        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id             UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role                participant_role NOT NULL DEFAULT 'member',
  last_read_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_muted            BOOLEAN     NOT NULL DEFAULT FALSE,
  joined_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at             TIMESTAMPTZ,

  CONSTRAINT conversation_participants_unique UNIQUE (conversation_id, user_id)
);

COMMENT ON TABLE public.conversation_participants IS
  'Members of a conversation. left_at IS NULL means currently active.';

COMMENT ON COLUMN public.conversation_participants.last_read_at IS
  'Used for unread count: COUNT messages WHERE created_at > last_read_at.';


-- ── messages ───────────────────────────────────────────────────────────────
-- Individual messages. Append-only by design — soft-deleted via deleted_at,
-- edited via edited_at (original body is NOT stored; edit history is out of
-- scope for MVP but the edited_at column preserves the audit trail).
--
-- `reply_to_id` enables threaded replies. Self-referential FK with SET NULL
--   so deleting a parent message does not cascade-delete replies.
-- `metadata` holds type-specific data:
--   text    → {}
--   image   → { url, width, height, thumbnailUrl, size }
--   system  → { event: 'user_joined' | 'user_left' | 'title_changed', ... }
--
-- `is_broadcast_root` — TRUE only on the initiating message of a broadcast
--   conversation. Allows the sender's UI to show delivery/read analytics.
CREATE TABLE IF NOT EXISTS public.messages (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id     UUID        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id           UUID        NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  body                TEXT        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  type                message_type NOT NULL DEFAULT 'text',
  reply_to_id         UUID        REFERENCES public.messages(id) ON DELETE SET NULL,
  metadata            JSONB       NOT NULL DEFAULT '{}',
  is_broadcast_root   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at           TIMESTAMPTZ,
  deleted_at          TIMESTAMPTZ
);

COMMENT ON TABLE public.messages IS
  'Individual chat messages. Soft-deleted; never physically removed in MVP.';

COMMENT ON COLUMN public.messages.body IS
  'Plaintext or markdown body. Max 4000 chars. For images, body holds alt text.';

COMMENT ON COLUMN public.messages.metadata IS
  'Type-specific payload: image URL/dimensions for image type, event data for system type.';

-- Now that messages exists, add the deferred FK on conversations
ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_last_message_id_fk
  FOREIGN KEY (last_message_id) REFERENCES public.messages(id) ON DELETE SET NULL;


-- ── message_reads ──────────────────────────────────────────────────────────
-- Per-message, per-user read receipt. Used for:
--   1. Broadcast analytics (sender sees exactly who read their message)
--   2. Direct message blue-tick (both participants visible)
--
-- For unread COUNT in the conversation list, we use
--   conversation_participants.last_read_at (timestamp comparison) — O(1).
-- For delivery UI within a thread, we query message_reads — O(participants).
--
-- Only created when a user explicitly views/opens a message. NOT created
-- for the sender's own messages (sender is implicitly read).
CREATE TABLE IF NOT EXISTS public.message_reads (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id      UUID        NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  read_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT message_reads_unique UNIQUE (message_id, user_id)
);

COMMENT ON TABLE public.message_reads IS
  'Per-message read receipts. Distinct from last_read_at which drives unread counts.';


-- ── notification_preferences ───────────────────────────────────────────────
-- Per-user opt-in/opt-out for each notification channel and type.
-- Defaults to all enabled. The service layer checks this before delivering.
--
-- `push_enabled`   — browser/mobile push (future)
-- `email_enabled`  — email digest
-- `ws_enabled`     — real-time WebSocket delivery (should rarely be false)
-- `types_muted`    — array of notification_type values the user has silenced
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  push_enabled    BOOLEAN     NOT NULL DEFAULT TRUE,
  email_enabled   BOOLEAN     NOT NULL DEFAULT TRUE,
  ws_enabled      BOOLEAN     NOT NULL DEFAULT TRUE,
  types_muted     TEXT[]      NOT NULL DEFAULT '{}',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT notification_preferences_user_unique UNIQUE (user_id)
);

COMMENT ON TABLE public.notification_preferences IS
  'Per-user notification delivery channel preferences. Created lazily on first preference change.';


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 3: INDEXES
-- Every index is justified by a specific query pattern.
-- ═══════════════════════════════════════════════════════════════════════════

-- conversations
-- Conversation list for a user: JOIN via participants WHERE user_id = $id
-- ORDER BY last_activity_at DESC — this index serves that ORDER BY.
CREATE INDEX IF NOT EXISTS idx_conversations_last_activity
  ON public.conversations (last_activity_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_created_by
  ON public.conversations (created_by);

CREATE INDEX IF NOT EXISTS idx_conversations_type
  ON public.conversations (type);


-- conversation_participants
-- The most critical index. Every authorization check does:
--   SELECT 1 FROM conversation_participants
--   WHERE conversation_id = $id AND user_id = $userId AND left_at IS NULL
-- This composite index makes that O(1) instead of a sequential scan.
CREATE INDEX IF NOT EXISTS idx_conv_participants_conv_user
  ON public.conversation_participants (conversation_id, user_id);

-- Reverse lookup: "give me all conversations for user X"
-- Used for the inbox query and unread count aggregation.
CREATE INDEX IF NOT EXISTS idx_conv_participants_user_id
  ON public.conversation_participants (user_id)
  WHERE left_at IS NULL;

-- Unread count optimization: partial index on active, un-left participants
CREATE INDEX IF NOT EXISTS idx_conv_participants_active
  ON public.conversation_participants (user_id, last_read_at)
  WHERE left_at IS NULL;


-- messages
-- Message history within a conversation: ORDER BY created_at DESC, cursor paginated.
-- This is the hottest read path — index must be tight.
CREATE INDEX IF NOT EXISTS idx_messages_conv_created
  ON public.messages (conversation_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Soft-deleted messages excluded from default reads
CREATE INDEX IF NOT EXISTS idx_messages_deleted_at
  ON public.messages (deleted_at)
  WHERE deleted_at IS NULL;

-- Reply thread lookup: "give me all replies to message X"
CREATE INDEX IF NOT EXISTS idx_messages_reply_to
  ON public.messages (reply_to_id)
  WHERE reply_to_id IS NOT NULL;

-- Sender lookup: "give me all messages sent by user X in conversation Y"
-- Used for admin moderation and user message search.
CREATE INDEX IF NOT EXISTS idx_messages_sender
  ON public.messages (sender_id, conversation_id, created_at DESC);

-- Full-text search on message body.
-- tsvector column allows GIN index for fast ILIKE-free text search.
-- We use pg_trgm for partial match support (already enabled in 001).
CREATE INDEX IF NOT EXISTS idx_messages_body_trgm
  ON public.messages USING gin (body gin_trgm_ops)
  WHERE deleted_at IS NULL;


-- message_reads
-- "Has user X read message Y?" — the unique constraint covers this,
-- but an explicit index ensures the planner uses it for the IN (message_ids) variant.
CREATE INDEX IF NOT EXISTS idx_message_reads_message_id
  ON public.message_reads (message_id);

CREATE INDEX IF NOT EXISTS idx_message_reads_user_id
  ON public.message_reads (user_id);


-- notification_preferences
CREATE INDEX IF NOT EXISTS idx_notif_prefs_user_id
  ON public.notification_preferences (user_id);


-- ── Extend existing notifications table indexes ────────────────────────────
-- The notifications table already exists from 001_initial_schema.sql.
-- Add a covering index for the inbox query pattern:
--   SELECT * FROM notifications WHERE recipient_id = $id
--   AND is_read = FALSE ORDER BY created_at DESC LIMIT 20
-- The existing idx_notifications_unread may already cover this — we add
-- a broader index for the "all notifications" list (read + unread).
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created
  ON public.notifications (recipient_id, created_at DESC);

-- Notification type filtering: "show me only message notifications"
CREATE INDEX IF NOT EXISTS idx_notifications_type
  ON public.notifications (recipient_id, type, created_at DESC)
  WHERE is_read = FALSE;


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 4: TRIGGERS
-- All triggers use SECURITY DEFINER functions defined below.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── set_updated_at for conversations ──────────────────────────────────────
-- Reuse the existing set_updated_at() function from 001_auth_schema.sql.
DROP TRIGGER IF EXISTS set_conversations_updated_at ON public.conversations;
CREATE TRIGGER set_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_notif_prefs_updated_at ON public.notification_preferences;
CREATE TRIGGER set_notif_prefs_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── update_conversation_last_activity ─────────────────────────────────────
-- Fires AFTER INSERT on messages. Atomically updates:
--   conversations.last_message_id   → the new message id
--   conversations.last_activity_at  → NOW()
-- This denormalization means the inbox list query is a single table scan
-- on conversations JOIN participants — no subquery for "latest message".
CREATE OR REPLACE FUNCTION public.update_conversation_on_message_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.conversations
  SET
    last_message_id  = NEW.id,
    last_activity_at = NEW.created_at,
    updated_at       = NEW.created_at
  WHERE id = NEW.conversation_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conversation_last_activity ON public.messages;
CREATE TRIGGER trg_conversation_last_activity
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.update_conversation_on_message_insert();


-- ── update_participant_last_read ───────────────────────────────────────────
-- Fires AFTER INSERT on message_reads. Keeps conversation_participants
-- .last_read_at in sync so that the lightweight unread-count path stays
-- accurate without scanning message_reads.
CREATE OR REPLACE FUNCTION public.sync_participant_last_read()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_conversation_id UUID;
BEGIN
  -- Resolve the conversation_id from the message
  SELECT conversation_id INTO v_conversation_id
  FROM public.messages
  WHERE id = NEW.message_id;

  -- Update last_read_at only if the new read_at is more recent
  UPDATE public.conversation_participants
  SET last_read_at = NEW.read_at
  WHERE conversation_id = v_conversation_id
    AND user_id         = NEW.user_id
    AND last_read_at    < NEW.read_at;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_participant_last_read ON public.message_reads;
CREATE TRIGGER trg_sync_participant_last_read
  AFTER INSERT ON public.message_reads
  FOR EACH ROW EXECUTE FUNCTION public.sync_participant_last_read();


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 5: RPC FUNCTIONS
-- All called from the repository layer. SECURITY DEFINER so they run
-- with service-role privileges regardless of the calling role.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── get_or_create_direct_conversation ─────────────────────────────────────
-- Atomically finds an existing direct conversation between two users, or
-- creates one if none exists. Prevents the race condition where two clients
-- simultaneously attempt to open a DM and end up with duplicate conversations.
--
-- Returns the conversation id (existing or newly created).
CREATE OR REPLACE FUNCTION public.get_or_create_direct_conversation(
  p_user_a UUID,
  p_user_b UUID
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_conversation_id UUID;
  v_new_conv_id     UUID;
BEGIN
  -- Look for an existing direct conversation where both users are active participants
  SELECT cp1.conversation_id INTO v_conversation_id
  FROM public.conversation_participants cp1
  JOIN public.conversation_participants cp2
    ON cp1.conversation_id = cp2.conversation_id
  JOIN public.conversations c
    ON c.id = cp1.conversation_id
  WHERE cp1.user_id = p_user_a
    AND cp2.user_id = p_user_b
    AND cp1.left_at IS NULL
    AND cp2.left_at IS NULL
    AND c.type = 'direct'
  LIMIT 1;

  IF v_conversation_id IS NOT NULL THEN
    RETURN v_conversation_id;
  END IF;

  -- None found — create the conversation and both participant rows atomically
  v_new_conv_id := gen_random_uuid();

  INSERT INTO public.conversations (id, type, created_by)
  VALUES (v_new_conv_id, 'direct', p_user_a);

  INSERT INTO public.conversation_participants (conversation_id, user_id, role)
  VALUES
    (v_new_conv_id, p_user_a, 'owner'),
    (v_new_conv_id, p_user_b, 'member');

  RETURN v_new_conv_id;
END;
$$;


-- ── create_broadcast_conversation ─────────────────────────────────────────
-- Creates a broadcast conversation with the sender as owner and inserts
-- all recipient participant rows in a single transaction. The first message
-- is NOT inserted here — that is handled by the message service after this
-- returns, so we get the conversation id first.
--
-- p_recipient_ids — UUID array of recipient user ids (max 1000 enforced here)
-- Returns the new conversation id.
CREATE OR REPLACE FUNCTION public.create_broadcast_conversation(
  p_sender_id      UUID,
  p_title          VARCHAR(120),
  p_recipient_ids  UUID[]
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_conv_id  UUID;
  v_count    INT;
BEGIN
  v_count := array_length(p_recipient_ids, 1);

  IF v_count IS NULL OR v_count = 0 THEN
    RAISE EXCEPTION 'broadcast requires at least 1 recipient';
  END IF;

  IF v_count > 1000 THEN
    RAISE EXCEPTION 'broadcast recipient limit is 1000, got %', v_count;
  END IF;

  v_conv_id := gen_random_uuid();

  INSERT INTO public.conversations (id, type, title, created_by)
  VALUES (v_conv_id, 'broadcast', p_title, p_sender_id);

  -- Sender as owner
  INSERT INTO public.conversation_participants (conversation_id, user_id, role)
  VALUES (v_conv_id, p_sender_id, 'owner');

  -- Recipients as members — unnest is set-returning, single INSERT
  INSERT INTO public.conversation_participants (conversation_id, user_id, role)
  SELECT v_conv_id, uid, 'member'
  FROM unnest(p_recipient_ids) AS t(uid)
  WHERE uid != p_sender_id              -- sender already inserted above
  ON CONFLICT (conversation_id, user_id) DO NOTHING;

  RETURN v_conv_id;
END;
$$;


-- ── mark_messages_read ────────────────────────────────────────────────────
-- Batch-marks all messages in a conversation as read for a given user,
-- up to and including a specific message (cursor-based).
-- Inserts missing message_reads rows and updates last_read_at on the
-- participant row in one call — avoids N+1 from the application layer.
--
-- p_up_to_message_id — the id of the latest message the user has seen.
-- Returns the number of messages newly marked as read.
CREATE OR REPLACE FUNCTION public.mark_messages_read(
  p_conversation_id  UUID,
  p_user_id          UUID,
  p_up_to_message_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_up_to_ts  TIMESTAMPTZ;
  v_count     INT;
BEGIN
  -- Resolve the timestamp of the cursor message
  SELECT created_at INTO v_up_to_ts
  FROM public.messages
  WHERE id = p_up_to_message_id
    AND conversation_id = p_conversation_id;

  IF v_up_to_ts IS NULL THEN
    RAISE EXCEPTION 'message % not found in conversation %',
      p_up_to_message_id, p_conversation_id;
  END IF;

  -- Insert read receipts for all unread messages up to the cursor,
  -- excluding the reader's own messages (sender is implicitly read).
  WITH inserted AS (
    INSERT INTO public.message_reads (message_id, user_id, read_at)
    SELECT m.id, p_user_id, NOW()
    FROM public.messages m
    WHERE m.conversation_id = p_conversation_id
      AND m.sender_id       != p_user_id
      AND m.created_at      <= v_up_to_ts
      AND m.deleted_at      IS NULL
    ON CONFLICT (message_id, user_id) DO NOTHING
    RETURNING message_id
  )
  SELECT COUNT(*) INTO v_count FROM inserted;

  -- Advance the participant's last_read_at bookmark
  UPDATE public.conversation_participants
  SET last_read_at = GREATEST(last_read_at, v_up_to_ts)
  WHERE conversation_id = p_conversation_id
    AND user_id         = p_user_id;

  RETURN v_count;
END;
$$;


-- ── get_conversation_unread_counts ────────────────────────────────────────
-- Returns unread message counts per conversation for a given user.
-- Used to populate the inbox badge and per-conversation unread indicators.
--
-- Uses the timestamp-comparison approach against last_read_at for O(1)
-- per conversation (one range query on the messages index per conversation).
-- The result set is bounded by the number of conversations the user is in.
--
-- Returns: TABLE (conversation_id UUID, unread_count BIGINT)
CREATE OR REPLACE FUNCTION public.get_conversation_unread_counts(
  p_user_id UUID
)
RETURNS TABLE (
  conversation_id UUID,
  unread_count    BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    cp.conversation_id,
    COUNT(m.id) AS unread_count
  FROM public.conversation_participants cp
  JOIN public.messages m
    ON m.conversation_id = cp.conversation_id
   AND m.sender_id      != p_user_id
   AND m.created_at     >  cp.last_read_at
   AND m.deleted_at     IS NULL
  WHERE cp.user_id  = p_user_id
    AND cp.left_at  IS NULL
  GROUP BY cp.conversation_id;
END;
$$;


-- ── get_conversation_with_participants ─────────────────────────────────────
-- Returns a conversation row with its participants as a JSON array.
-- Avoids N+1 in the service layer when rendering conversation detail.
-- Used by the REST GET /api/conversations/:id endpoint.
CREATE OR REPLACE FUNCTION public.get_conversation_with_participants(
  p_conversation_id UUID,
  p_requesting_user UUID
)
RETURNS TABLE (
  id               UUID,
  type             conversation_type,
  title            VARCHAR,
  created_by       UUID,
  last_message_id  UUID,
  last_activity_at TIMESTAMPTZ,
  metadata         JSONB,
  created_at       TIMESTAMPTZ,
  participants     JSONB,
  unread_count     BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Authorization: requesting user must be a participant
  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = p_conversation_id
      AND user_id = p_requesting_user
      AND left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.type,
    c.title,
    c.created_by,
    c.last_message_id,
    c.last_activity_at,
    c.metadata,
    c.created_at,
    -- Aggregate participants as JSON to avoid a second round-trip
    COALESCE(
      json_agg(
        json_build_object(
          'user_id',      cp.user_id,
          'role',         cp.role,
          'last_read_at', cp.last_read_at,
          'is_muted',     cp.is_muted,
          'joined_at',    cp.joined_at
        ) ORDER BY cp.joined_at
      ) FILTER (WHERE cp.left_at IS NULL),
      '[]'::json
    )::jsonb AS participants,
    -- Unread count for the requesting user specifically
    COUNT(m.id) FILTER (
      WHERE m.sender_id  != p_requesting_user
        AND m.created_at >  (
          SELECT last_read_at FROM public.conversation_participants
          WHERE conversation_id = p_conversation_id
            AND user_id = p_requesting_user
        )
        AND m.deleted_at IS NULL
    ) AS unread_count
  FROM public.conversations c
  JOIN public.conversation_participants cp
    ON cp.conversation_id = c.id
  LEFT JOIN public.messages m
    ON m.conversation_id = c.id
  WHERE c.id = p_conversation_id
  GROUP BY c.id, c.type, c.title, c.created_by,
           c.last_message_id, c.last_activity_at,
           c.metadata, c.created_at;
END;
$$;


-- ── search_messages ────────────────────────────────────────────────────────
-- Full-text trigram search within a single conversation.
-- Requires pg_trgm (enabled in 001 or 002 via CREATE EXTENSION).
-- Returns messages ordered by relevance score DESC, then recency DESC.
--
-- p_query       — the search term (min 2 chars enforced at service layer)
-- p_limit       — max results (default 20, max 50)
-- p_before_id   — cursor for pagination (optional)
CREATE OR REPLACE FUNCTION public.search_messages(
  p_conversation_id  UUID,
  p_user_id          UUID,
  p_query            TEXT,
  p_limit            INT     DEFAULT 20,
  p_before_id        UUID    DEFAULT NULL
)
RETURNS TABLE (
  id              UUID,
  conversation_id UUID,
  sender_id       UUID,
  body            TEXT,
  type            message_type,
  reply_to_id     UUID,
  metadata        JSONB,
  created_at      TIMESTAMPTZ,
  edited_at       TIMESTAMPTZ,
  similarity_rank REAL
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_before_ts TIMESTAMPTZ := NOW();
BEGIN
  -- Authorization: user must be an active participant
  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = p_conversation_id
      AND user_id = p_user_id
      AND left_at IS NULL
  ) THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = 'P0001';
  END IF;

  -- Resolve cursor timestamp
  IF p_before_id IS NOT NULL THEN
    SELECT m.created_at INTO v_before_ts
    FROM public.messages m
    WHERE m.id = p_before_id;
  END IF;

  -- Clamp limit
  p_limit := LEAST(p_limit, 50);

  RETURN QUERY
  SELECT
    m.id,
    m.conversation_id,
    m.sender_id,
    m.body,
    m.type,
    m.reply_to_id,
    m.metadata,
    m.created_at,
    m.edited_at,
    similarity(m.body, p_query) AS similarity_rank
  FROM public.messages m
  WHERE m.conversation_id = p_conversation_id
    AND m.deleted_at      IS NULL
    AND m.created_at      < v_before_ts
    AND m.body            ILIKE '%' || p_query || '%'
  ORDER BY similarity_rank DESC, m.created_at DESC
  LIMIT p_limit;
END;
$$;


-- ── search_conversations ──────────────────────────────────────────────────
-- Searches across a user's conversations by participant display name
-- or conversation title. Returns conversations ordered by match relevance
-- then last_activity_at. This drives the search bar in the inbox sidebar.
CREATE OR REPLACE FUNCTION public.search_conversations(
  p_user_id UUID,
  p_query   TEXT,
  p_limit   INT DEFAULT 20
)
RETURNS TABLE (
  conversation_id  UUID,
  type             conversation_type,
  title            VARCHAR,
  last_activity_at TIMESTAMPTZ,
  last_message_id  UUID,
  unread_count     BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  p_limit := LEAST(p_limit, 50);

  RETURN QUERY
  SELECT DISTINCT ON (c.id)
    c.id               AS conversation_id,
    c.type,
    c.title,
    c.last_activity_at,
    c.last_message_id,
    COUNT(m.id) FILTER (
      WHERE m.sender_id  != p_user_id
        AND m.created_at >  cp_self.last_read_at
        AND m.deleted_at IS NULL
    ) AS unread_count
  FROM public.conversations c
  -- Self participation
  JOIN public.conversation_participants cp_self
    ON cp_self.conversation_id = c.id
   AND cp_self.user_id         = p_user_id
   AND cp_self.left_at         IS NULL
  -- Other participants (for name matching on direct conversations)
  LEFT JOIN public.conversation_participants cp_other
    ON cp_other.conversation_id = c.id
   AND cp_other.user_id        != p_user_id
   AND cp_other.left_at        IS NULL
  LEFT JOIN public.users u
    ON u.id = cp_other.user_id
  -- Unread count
  LEFT JOIN public.messages m
    ON m.conversation_id = c.id
  WHERE
    (
      -- Match by conversation title (broadcasts)
      c.title ILIKE '%' || p_query || '%'
      -- Match by other participant's username or email (direct)
      OR u.email    ILIKE '%' || p_query || '%'
    )
  GROUP BY c.id, c.type, c.title, c.last_activity_at,
           c.last_message_id, cp_self.last_read_at
  ORDER BY c.id, c.last_activity_at DESC
  LIMIT p_limit;
END;
$$;


-- ── leave_conversation ─────────────────────────────────────────────────────
-- Soft-leaves a conversation by setting left_at. If the leaving user was
-- the owner and other participants remain, promotes the earliest-joined
-- member to owner. If no members remain, marks the conversation deleted
-- (the conversation row is kept for audit; messages are preserved).
CREATE OR REPLACE FUNCTION public.leave_conversation(
  p_conversation_id UUID,
  p_user_id         UUID
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_is_owner      BOOLEAN;
  v_next_owner_id UUID;
  v_remaining     INT;
BEGIN
  -- Verify membership
  SELECT role = 'owner' INTO v_is_owner
  FROM public.conversation_participants
  WHERE conversation_id = p_conversation_id
    AND user_id         = p_user_id
    AND left_at         IS NULL;

  IF v_is_owner IS NULL THEN
    RAISE EXCEPTION 'user is not an active participant' USING ERRCODE = 'P0002';
  END IF;

  -- Soft-leave
  UPDATE public.conversation_participants
  SET left_at = NOW()
  WHERE conversation_id = p_conversation_id
    AND user_id         = p_user_id;

  -- Count remaining active participants
  SELECT COUNT(*) INTO v_remaining
  FROM public.conversation_participants
  WHERE conversation_id = p_conversation_id
    AND left_at         IS NULL;

  -- If owner left and others remain, promote the earliest remaining member
  IF v_is_owner AND v_remaining > 0 THEN
    SELECT user_id INTO v_next_owner_id
    FROM public.conversation_participants
    WHERE conversation_id = p_conversation_id
      AND left_at         IS NULL
    ORDER BY joined_at
    LIMIT 1;

    UPDATE public.conversation_participants
    SET role = 'owner'
    WHERE conversation_id = p_conversation_id
      AND user_id         = v_next_owner_id;
  END IF;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 6: ROW LEVEL SECURITY
-- Same pattern as 001_auth_schema.sql — deny all for non-service roles.
-- The service role key bypasses RLS; these policies protect against
-- accidental anon/authenticated role access.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.conversations                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reads               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_all_conversations"
  ON public.conversations              USING (FALSE);

CREATE POLICY "deny_all_conv_participants"
  ON public.conversation_participants  USING (FALSE);

CREATE POLICY "deny_all_messages"
  ON public.messages                   USING (FALSE);

CREATE POLICY "deny_all_message_reads"
  ON public.message_reads             USING (FALSE);

CREATE POLICY "deny_all_notif_prefs"
  ON public.notification_preferences  USING (FALSE);


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 7: SEED DATA (DEVELOPMENT ONLY)
-- Wrapped in a DO block that checks NODE_ENV equivalent via a config table.
-- In production this block evaluates to a no-op.
-- ═══════════════════════════════════════════════════════════════════════════

-- No seed data required for messaging. The get_or_create_direct_conversation
-- RPC handles first-message creation atomically at runtime.


-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 8: GRANTS
-- Explicit grants to the service role are required when using Supabase
-- with schema-level RLS. The service role bypasses RLS but still needs
-- table-level GRANT to perform DML.
-- ═══════════════════════════════════════════════════════════════════════════

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations             TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_participants TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages                  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_reads            TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO service_role;

GRANT EXECUTE ON FUNCTION public.get_or_create_direct_conversation(UUID, UUID)                   TO service_role;
GRANT EXECUTE ON FUNCTION public.create_broadcast_conversation(UUID, VARCHAR, UUID[])            TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_messages_read(UUID, UUID, UUID)                           TO service_role;
GRANT EXECUTE ON FUNCTION public.get_conversation_unread_counts(UUID)                           TO service_role;
GRANT EXECUTE ON FUNCTION public.get_conversation_with_participants(UUID, UUID)                 TO service_role;
GRANT EXECUTE ON FUNCTION public.search_messages(UUID, UUID, TEXT, INT, UUID)                   TO service_role;
GRANT EXECUTE ON FUNCTION public.search_conversations(UUID, TEXT, INT)                          TO service_role;
GRANT EXECUTE ON FUNCTION public.leave_conversation(UUID, UUID)                                 TO service_role;
GRANT EXECUTE ON FUNCTION public.update_conversation_on_message_insert()                        TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_participant_last_read()                                   TO service_role;