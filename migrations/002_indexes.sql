-- Users
CREATE INDEX idx_users_auth_id ON users(auth_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NULL;

-- Profiles
CREATE INDEX idx_profiles_user_id ON profiles(user_id);
CREATE INDEX idx_profiles_username ON profiles(username);
CREATE INDEX idx_profiles_username_trgm ON profiles USING gin(username gin_trgm_ops);
CREATE INDEX idx_profiles_display_name_trgm ON profiles USING gin(display_name gin_trgm_ops);

-- Artworks
CREATE INDEX idx_artworks_user_id ON artworks(user_id);
CREATE INDEX idx_artworks_category ON artworks(category);
CREATE INDEX idx_artworks_visibility ON artworks(visibility) WHERE deleted_at IS NULL;
CREATE INDEX idx_artworks_availability ON artworks(availability);
CREATE INDEX idx_artworks_created_at ON artworks(created_at DESC);
CREATE INDEX idx_artworks_likes_count ON artworks(likes_count DESC);
CREATE INDEX idx_artworks_tags ON artworks USING gin(tags);
CREATE INDEX idx_artworks_title_trgm ON artworks USING gin(title gin_trgm_ops);
CREATE INDEX idx_artworks_deleted_at ON artworks(deleted_at) WHERE deleted_at IS NULL;
-- Composite: user's public artworks ordered by newest
CREATE INDEX idx_artworks_user_public ON artworks(user_id, created_at DESC)
  WHERE visibility = 'public' AND deleted_at IS NULL;

-- Likes
CREATE INDEX idx_likes_artwork_id ON likes(artwork_id);
CREATE INDEX idx_likes_user_id ON likes(user_id);

-- Saves
CREATE INDEX idx_saves_user_id ON saves(user_id);
CREATE INDEX idx_saves_artwork_id ON saves(artwork_id);

-- Comments
CREATE INDEX idx_comments_artwork_id ON comments(artwork_id);
CREATE INDEX idx_comments_user_id ON comments(user_id);
CREATE INDEX idx_comments_parent_id ON comments(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX idx_comments_deleted_at ON comments(deleted_at) WHERE deleted_at IS NULL;

-- Follows
CREATE INDEX idx_follows_follower_id ON follows(follower_id);
CREATE INDEX idx_follows_following_id ON follows(following_id);

-- Notifications
CREATE INDEX idx_notifications_recipient_id ON notifications(recipient_id);
CREATE INDEX idx_notifications_unread ON notifications(recipient_id, created_at DESC)
  WHERE is_read = FALSE;

-- Orders
CREATE INDEX idx_orders_buyer_id ON orders(buyer_id);
CREATE INDEX idx_orders_seller_id ON orders(seller_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_artwork_id ON orders(artwork_id);

-- Transactions
CREATE INDEX idx_transactions_sender_id ON transactions(sender_id);
CREATE INDEX idx_transactions_recipient_id ON transactions(recipient_id);
CREATE INDEX idx_transactions_order_id ON transactions(order_id);
CREATE INDEX idx_transactions_tx_hash ON transactions(tx_hash) WHERE tx_hash IS NOT NULL;
CREATE INDEX idx_transactions_status ON transactions(status);

-- Wallet history
CREATE INDEX idx_wallet_history_user_id ON wallet_history(user_id);
CREATE INDEX idx_wallet_history_created_at ON wallet_history(user_id, created_at DESC);

-- Audit logs
CREATE INDEX idx_audit_logs_actor_id ON audit_logs(actor_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);