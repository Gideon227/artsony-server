ALTER TABLE public.shipping_addresses
  ALTER COLUMN phone DROP NOT NULL;

COMMENT ON COLUMN public.shipping_addresses.phone IS
  'Optional on the saved address. A phone number is still required on the order snapshot, so checkout rejects a saved address that has none.';