ALTER TABLE public.seller_registrations
  ADD COLUMN IF NOT EXISTS city VARCHAR(100);

COMMENT ON COLUMN public.seller_registrations.city IS
  'Dispatch city. Nullable: registrations created before this column existed have no value.';