-- ─────────────────────────────────────────────────────────────────────────
-- notification_preferences (from 20240201000000_messaging_schema.sql) has
-- never had any application code reading or writing it, and the
-- notification-generating code has two real correctness issues that
-- surface now that muting is being wired up for real:
--
-- 1. review.service.ts creates review notifications with type 'comment' —
--    a user muting comment notifications would silently also lose review
--    notifications. Fixed by giving reviews their own type.
-- 2. wallet.service.ts creates earnings/withdrawal notifications with the
--    generic type 'system' — same collision risk against genuine platform
--    announcements, which also use 'system'. Fixed in application code by
--    repurposing the 'sale' enum value (already defined, never used) for
--    wallet/earnings notifications instead — no migration needed for that
--    one since 'sale' already exists.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'review';
