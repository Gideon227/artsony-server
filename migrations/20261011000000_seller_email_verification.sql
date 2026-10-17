ALTER TABLE public.seller_registrations
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

COMMENT ON COLUMN public.seller_registrations.email_verified_at IS
  'When the applicant proved ownership of seller_registrations.email with an emailed code. NULL for registrations created before email verification existed.';

DROP FUNCTION IF EXISTS public.submit_seller_registration(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.submit_seller_registration(
  p_user_id           UUID,
  p_full_name         TEXT,
  p_username          TEXT,
  p_email             TEXT,
  p_phone_number      TEXT,
  p_address           TEXT,
  p_state             TEXT,
  p_country           TEXT,
  p_postal_code       TEXT DEFAULT NULL,
  p_city              TEXT DEFAULT NULL,
  p_email_verified_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS SETOF public.seller_registrations
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  existing public.seller_registrations%ROWTYPE;
BEGIN
  SELECT * INTO existing
  FROM public.seller_registrations
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY
      INSERT INTO public.seller_registrations (
        user_id, full_name, username, email, phone_number,
        address, state, country, city, postal_code, email_verified_at, status
      ) VALUES (
        p_user_id, p_full_name, p_username, p_email, p_phone_number,
        p_address, p_state, p_country, p_city, p_postal_code, p_email_verified_at, 'PENDING'
      )
      RETURNING *;
    RETURN;
  END IF;

  IF existing.status <> 'REJECTED' THEN
    RAISE EXCEPTION 'A seller registration already exists with status %', existing.status
      USING ERRCODE = '23505';
  END IF;

  RETURN QUERY
    UPDATE public.seller_registrations
    SET full_name         = p_full_name,
        username          = p_username,
        email             = p_email,
        phone_number      = p_phone_number,
        address           = p_address,
        state             = p_state,
        country           = p_country,
        city              = p_city,
        postal_code       = p_postal_code,
        email_verified_at = p_email_verified_at,
        status            = 'PENDING',
        reviewed_by       = NULL,
        review_notes      = NULL,
        updated_at        = NOW()
    WHERE id = existing.id
    RETURNING *;
END;
$$;

-- These SECURITY DEFINER functions write to users.role and seller_registrations.
-- They are only ever called by the backend with the service-role key, so they
-- must not be executable through PostgREST by anon or authenticated clients.
REVOKE ALL ON FUNCTION public.submit_seller_registration(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_seller_registration(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ)
  TO service_role;

REVOKE ALL ON FUNCTION public.transition_seller_registration(UUID, seller_registration_status, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_seller_registration(UUID, seller_registration_status, UUID, TEXT)
  TO service_role;