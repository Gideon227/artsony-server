-- Drafts may be saved before the artist has typed anything, so an empty title
-- must be storable. Publishing still requires one: the new check keeps the
-- "published artworks have a title" guarantee in the database.
--
-- The original CHECK (char_length(title) BETWEEN 1 AND 300) was declared
-- inline, so its name is looked up instead of assumed.

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.artworks'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%char_length(title)%'
  LOOP
    EXECUTE format('ALTER TABLE public.artworks DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.artworks
  DROP CONSTRAINT IF EXISTS artworks_title_length_check,
  DROP CONSTRAINT IF EXISTS artworks_published_title_check;

ALTER TABLE public.artworks
  ADD CONSTRAINT artworks_title_length_check
    CHECK (char_length(title) <= 300),
  ADD CONSTRAINT artworks_published_title_check
    CHECK (status <> 'PUBLISHED' OR char_length(btrim(title)) >= 1);
