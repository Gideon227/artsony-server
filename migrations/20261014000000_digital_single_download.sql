-- Digital purchases can be downloaded exactly once, with no time limit.
-- Existing tokens are updated as well: anything already downloaded becomes
-- exhausted, anything not yet downloaded keeps its single download.

ALTER TABLE public.digital_delivery_tokens
  ALTER COLUMN max_downloads SET DEFAULT 1;

UPDATE public.digital_delivery_tokens
   SET max_downloads = 1
 WHERE max_downloads <> 1;

ALTER TABLE public.digital_delivery_tokens
  ALTER COLUMN expires_at DROP NOT NULL;

UPDATE public.digital_delivery_tokens
   SET expires_at = NULL
 WHERE expires_at IS NOT NULL;
