-- ── Toggle save (mirrors toggle_artwork_like) ────────────────────────────────
CREATE OR REPLACE FUNCTION toggle_artwork_save(p_artwork_id UUID, p_user_id UUID)
RETURNS TABLE(saved BOOLEAN, save_count INTEGER) AS $$
DECLARE
  v_existing UUID;
BEGIN
  SELECT id INTO v_existing FROM saves
  WHERE artwork_id = p_artwork_id AND user_id = p_user_id;

  IF v_existing IS NOT NULL THEN
    DELETE FROM saves WHERE id = v_existing;
  ELSE
    INSERT INTO saves (user_id, artwork_id) VALUES (p_user_id, p_artwork_id);
  END IF;

  RETURN QUERY
    SELECT (v_existing IS NULL), a.saves_count
    FROM artworks a WHERE a.id = p_artwork_id;
END;
$$ LANGUAGE plpgsql;

-- ── Reports (distinct from moderator flag — any user can file one) ──────────
CREATE TYPE report_reason AS ENUM (
  'COPYRIGHT', 'INAPPROPRIATE', 'SPAM', 'MISLEADING', 'HARASSMENT', 'OTHER'
);
CREATE TYPE report_status AS ENUM ('PENDING', 'REVIEWED', 'DISMISSED');

CREATE TABLE artwork_reports (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  artwork_id  UUID NOT NULL REFERENCES artworks(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason      report_reason NOT NULL,
  notes       TEXT CHECK (char_length(notes) <= 1000),
  status      report_status NOT NULL DEFAULT 'PENDING',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT artwork_reports_unique UNIQUE (artwork_id, reporter_id)
);

CREATE INDEX idx_artwork_reports_artwork_id ON artwork_reports(artwork_id);
CREATE INDEX idx_artwork_reports_status ON artwork_reports(status) WHERE status = 'PENDING';

ALTER TABLE artwork_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_all_artwork_reports" ON artwork_reports USING (FALSE);