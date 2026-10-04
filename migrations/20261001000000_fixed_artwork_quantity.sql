UPDATE public.artworks
SET
  assets = CASE
    WHEN jsonb_typeof(assets) = 'string' THEN (assets #>> '{}')::jsonb
    ELSE assets
  END,
  variants = CASE
    WHEN jsonb_typeof(variants) = 'string' THEN (variants #>> '{}')::jsonb
    ELSE variants
  END,
  physical_details = CASE
    WHEN jsonb_typeof(physical_details) = 'string' THEN (physical_details #>> '{}')::jsonb
    ELSE physical_details
  END
WHERE jsonb_typeof(assets) = 'string'
   OR jsonb_typeof(variants) = 'string'
   OR jsonb_typeof(physical_details) = 'string';

CREATE OR REPLACE FUNCTION public.reserve_artwork_stock(
  p_artwork_id        UUID,
  p_quantity          INTEGER,
  p_variant_option_id TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql AS $$
DECLARE
  v_physical   JSONB;
  v_qty        INTEGER;
  v_variants   JSONB;
  v_opt_stock  INTEGER;
BEGIN
  SELECT physical_details, variants
  INTO   v_physical, v_variants
  FROM   public.artworks
  WHERE  id = p_artwork_id
    AND  deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_physical IS NOT NULL THEN
    IF jsonb_typeof(v_physical) <> 'object' THEN
      RETURN FALSE;
    END IF;
    v_qty := (v_physical->>'available_quantity')::INTEGER;
    IF v_qty IS NULL OR v_qty < p_quantity THEN
      RETURN FALSE;
    END IF;
    v_physical := jsonb_set(
      v_physical,
      '{available_quantity}',
      to_jsonb(v_qty - p_quantity)
    );
  END IF;

  IF p_variant_option_id IS NOT NULL AND v_variants IS NOT NULL THEN
    DECLARE
      v_variant_idx  INTEGER;
      v_option_idx   INTEGER;
      v_option       JSONB;
    BEGIN
      FOR v_variant_idx IN 0 .. jsonb_array_length(v_variants) - 1 LOOP
        FOR v_option_idx IN 0 .. jsonb_array_length(v_variants->v_variant_idx->'options') - 1 LOOP
          v_option := v_variants->v_variant_idx->'options'->v_option_idx;
          IF (v_option->>'id') = p_variant_option_id THEN
            IF (v_option->>'stock') IS NOT NULL THEN
              v_opt_stock := (v_option->>'stock')::INTEGER;
              IF v_opt_stock < p_quantity THEN
                RETURN FALSE;
              END IF;
              v_variants := jsonb_set(
                v_variants,
                ARRAY[v_variant_idx::TEXT, 'options', v_option_idx::TEXT, 'stock'],
                to_jsonb(v_opt_stock - p_quantity)
              );
            END IF;
          END IF;
        END LOOP;
      END LOOP;
    END;
  END IF;

  UPDATE public.artworks
  SET physical_details = v_physical,
      variants         = v_variants,
      updated_at       = NOW()
  WHERE id = p_artwork_id;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_artwork_stock(
  p_artwork_id        UUID,
  p_quantity          INTEGER,
  p_variant_option_id TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  v_physical   JSONB;
  v_variants   JSONB;
BEGIN
  SELECT physical_details, variants
  INTO   v_physical, v_variants
  FROM   public.artworks
  WHERE  id = p_artwork_id
    AND  deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF jsonb_typeof(v_physical) = 'object' AND (v_physical->>'available_quantity') IS NOT NULL THEN
    v_physical := jsonb_set(
      v_physical,
      '{available_quantity}',
      to_jsonb((v_physical->>'available_quantity')::INTEGER + p_quantity)
    );
  END IF;

  IF p_variant_option_id IS NOT NULL AND v_variants IS NOT NULL THEN
    DECLARE
      v_variant_idx INTEGER;
      v_option_idx  INTEGER;
      v_option      JSONB;
    BEGIN
      FOR v_variant_idx IN 0 .. jsonb_array_length(v_variants) - 1 LOOP
        FOR v_option_idx IN 0 .. jsonb_array_length(v_variants->v_variant_idx->'options') - 1 LOOP
          v_option := v_variants->v_variant_idx->'options'->v_option_idx;
          IF (v_option->>'id') = p_variant_option_id AND (v_option->>'stock') IS NOT NULL THEN
            v_variants := jsonb_set(
              v_variants,
              ARRAY[v_variant_idx::TEXT, 'options', v_option_idx::TEXT, 'stock'],
              to_jsonb((v_option->>'stock')::INTEGER + p_quantity)
            );
          END IF;
        END LOOP;
      END LOOP;
    END;
  END IF;

  UPDATE public.artworks
  SET physical_details = v_physical,
      variants         = v_variants,
      updated_at       = NOW()
  WHERE id = p_artwork_id;
END;
$$;