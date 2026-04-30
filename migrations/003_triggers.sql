-- =============================================
-- Keep denormalized counts consistent
-- =============================================

-- Artwork likes_count
CREATE OR REPLACE FUNCTION handle_like_insert()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE artworks SET likes_count = likes_count + 1 WHERE id = NEW.artwork_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION handle_like_delete()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE artworks SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = OLD.artwork_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_like_insert AFTER INSERT ON likes
  FOR EACH ROW EXECUTE FUNCTION handle_like_insert();

CREATE TRIGGER on_like_delete AFTER DELETE ON likes
  FOR EACH ROW EXECUTE FUNCTION handle_like_delete();

-- Artwork comments_count
CREATE OR REPLACE FUNCTION handle_comment_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_id IS NULL THEN
    UPDATE artworks SET comments_count = comments_count + 1 WHERE id = NEW.artwork_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION handle_comment_soft_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL AND NEW.parent_id IS NULL THEN
    UPDATE artworks SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = NEW.artwork_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_comment_insert AFTER INSERT ON comments
  FOR EACH ROW EXECUTE FUNCTION handle_comment_insert();

CREATE TRIGGER on_comment_soft_delete AFTER UPDATE OF deleted_at ON comments
  FOR EACH ROW EXECUTE FUNCTION handle_comment_soft_delete();

-- Profile followers_count / following_count
CREATE OR REPLACE FUNCTION handle_follow_insert()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE profiles SET following_count = following_count + 1 WHERE user_id = NEW.follower_id;
  UPDATE profiles SET followers_count = followers_count + 1 WHERE user_id = NEW.following_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION handle_follow_delete()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE profiles SET following_count = GREATEST(following_count - 1, 0) WHERE user_id = OLD.follower_id;
  UPDATE profiles SET followers_count = GREATEST(followers_count - 1, 0) WHERE user_id = OLD.following_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_follow_insert AFTER INSERT ON follows
  FOR EACH ROW EXECUTE FUNCTION handle_follow_insert();

CREATE TRIGGER on_follow_delete AFTER DELETE ON follows
  FOR EACH ROW EXECUTE FUNCTION handle_follow_delete();

-- Profile artworks_count
CREATE OR REPLACE FUNCTION handle_artwork_visibility_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Artwork becomes public
  IF NEW.visibility = 'public' AND NEW.deleted_at IS NULL
     AND (OLD.visibility != 'public' OR OLD.deleted_at IS NOT NULL) THEN
    UPDATE profiles SET artworks_count = artworks_count + 1 WHERE user_id = NEW.user_id;
  END IF;
  -- Artwork leaves public state
  IF OLD.visibility = 'public' AND OLD.deleted_at IS NULL
     AND (NEW.visibility != 'public' OR NEW.deleted_at IS NOT NULL) THEN
    UPDATE profiles SET artworks_count = GREATEST(artworks_count - 1, 0) WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_artwork_visibility_change AFTER INSERT OR UPDATE ON artworks
  FOR EACH ROW EXECUTE FUNCTION handle_artwork_visibility_change();

-- Artwork saves_count
CREATE OR REPLACE FUNCTION handle_save_insert()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE artworks SET saves_count = saves_count + 1 WHERE id = NEW.artwork_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION handle_save_delete()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE artworks SET saves_count = GREATEST(saves_count - 1, 0) WHERE id = OLD.artwork_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_save_insert AFTER INSERT ON saves
  FOR EACH ROW EXECUTE FUNCTION handle_save_insert();

CREATE TRIGGER on_save_delete AFTER DELETE ON saves
  FOR EACH ROW EXECUTE FUNCTION handle_save_delete();

-- =============================================
-- Row Level Security (RLS)
-- =============================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE artworks ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Public profiles and artworks are readable by all authenticated users
CREATE POLICY "Public profiles readable" ON profiles FOR SELECT USING (TRUE);
CREATE POLICY "Public artworks readable" ON artworks FOR SELECT
  USING (visibility = 'public' AND deleted_at IS NULL);

-- Users can only modify their own data
CREATE POLICY "Users own profile" ON profiles FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Users own artworks" ON artworks FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Users own likes" ON likes FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Users own saves" ON saves FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Users own cart" ON cart_items FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Users own notifications" ON notifications FOR SELECT
  USING (recipient_id = auth.uid());

CREATE POLICY "Users own orders" ON orders FOR SELECT
  USING (buyer_id = auth.uid() OR seller_id = auth.uid());

CREATE POLICY "Users own transactions" ON transactions FOR SELECT
  USING (sender_id = auth.uid() OR recipient_id = auth.uid());

CREATE POLICY "Users own wallet history" ON wallet_history FOR SELECT
  USING (user_id = auth.uid());