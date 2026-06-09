-- Migration: add interests column to users table
-- Run this in your Supabase SQL editor or via the migrations runner.
-- Safe to run multiple times (IF NOT EXISTS guards).

-- 1. Add the interests column (text array, defaults to empty)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS interests text[] NOT NULL DEFAULT '{}';

-- 2. Add a GIN index so array-contains queries (e.g. @>) stay fast
--    as the users table grows.
CREATE INDEX IF NOT EXISTS idx_users_interests
  ON public.users USING GIN (interests);

-- 3. (Optional) Add username column if it does not exist yet.
--    Remove this block if your users table already has a username column.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS username text;

-- Make username unique and not-null once backfilled.
-- If adding to an existing table with rows you must backfill first:
--   UPDATE public.users SET username = 'user_' || substring(id::text, 1, 8) WHERE username IS NULL;
-- Then:
--   ALTER TABLE public.users ALTER COLUMN username SET NOT NULL;
--   ALTER TABLE public.users ADD CONSTRAINT users_username_key UNIQUE (username);

-- 4. Confirm
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'users'
  AND column_name  IN ('interests', 'username');