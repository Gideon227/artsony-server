import { type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../common/types/database';
export declare function getSupabase(): SupabaseClient<Database>;
export declare function supabase(): SupabaseClient<Database, "public", "public", {
    Tables: {
        artworks: {
            Row: {
                allow_comments: boolean;
                allow_likes: boolean;
                allow_moodboard_save: boolean;
                artwork_format: Database["public"]["Enums"]["artwork_format"];
                assets: import("../common/types/database").Json;
                categories: string[];
                collaborator_ids: string[];
                comment_count: number;
                created_at: string;
                creator_id: string;
                currency: string;
                deleted_at: string | null;
                description: string;
                has_variants: boolean;
                id: string;
                is_flagged: boolean;
                keywords: string[];
                like_count: number;
                listing_type: Database["public"]["Enums"]["listing_type"];
                max_purchase_quantity: number | null;
                moderation_status: Database["public"]["Enums"]["moderation_status"];
                physical_details: import("../common/types/database").Json | null;
                price: number | null;
                purchase_count: number;
                review_notes: string | null;
                reviewed_by: string | null;
                save_count: number;
                search_vector: unknown;
                show_engagement_stats: boolean;
                slug: string;
                status: Database["public"]["Enums"]["artwork_status"];
                title: string;
                tools_used: string[];
                updated_at: string;
                variants: import("../common/types/database").Json;
                view_count: number;
                visibility: Database["public"]["Enums"]["artwork_visibility"];
            };
            Insert: {
                allow_comments?: boolean;
                allow_likes?: boolean;
                allow_moodboard_save?: boolean;
                artwork_format?: Database["public"]["Enums"]["artwork_format"];
                assets?: import("../common/types/database").Json;
                categories?: string[];
                collaborator_ids?: string[];
                comment_count?: number;
                created_at?: string;
                creator_id: string;
                currency?: string;
                deleted_at?: string | null;
                description: string;
                has_variants?: boolean;
                id?: string;
                is_flagged?: boolean;
                keywords?: string[];
                like_count?: number;
                listing_type?: Database["public"]["Enums"]["listing_type"];
                max_purchase_quantity?: number | null;
                moderation_status?: Database["public"]["Enums"]["moderation_status"];
                physical_details?: import("../common/types/database").Json | null;
                price?: number | null;
                purchase_count?: number;
                review_notes?: string | null;
                reviewed_by?: string | null;
                save_count?: number;
                search_vector?: unknown;
                show_engagement_stats?: boolean;
                slug: string;
                status?: Database["public"]["Enums"]["artwork_status"];
                title: string;
                tools_used?: string[];
                updated_at?: string;
                variants?: import("../common/types/database").Json;
                view_count?: number;
                visibility?: Database["public"]["Enums"]["artwork_visibility"];
            };
            Update: {
                allow_comments?: boolean;
                allow_likes?: boolean;
                allow_moodboard_save?: boolean;
                artwork_format?: Database["public"]["Enums"]["artwork_format"];
                assets?: import("../common/types/database").Json;
                categories?: string[];
                collaborator_ids?: string[];
                comment_count?: number;
                created_at?: string;
                creator_id?: string;
                currency?: string;
                deleted_at?: string | null;
                description?: string;
                has_variants?: boolean;
                id?: string;
                is_flagged?: boolean;
                keywords?: string[];
                like_count?: number;
                listing_type?: Database["public"]["Enums"]["listing_type"];
                max_purchase_quantity?: number | null;
                moderation_status?: Database["public"]["Enums"]["moderation_status"];
                physical_details?: import("../common/types/database").Json | null;
                price?: number | null;
                purchase_count?: number;
                review_notes?: string | null;
                reviewed_by?: string | null;
                save_count?: number;
                search_vector?: unknown;
                show_engagement_stats?: boolean;
                slug?: string;
                status?: Database["public"]["Enums"]["artwork_status"];
                title?: string;
                tools_used?: string[];
                updated_at?: string;
                variants?: import("../common/types/database").Json;
                view_count?: number;
                visibility?: Database["public"]["Enums"]["artwork_visibility"];
            };
            Relationships: [{
                foreignKeyName: "artworks_creator_id_fkey";
                columns: ["creator_id"];
                isOneToOne: false;
                referencedRelation: "users";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "artworks_reviewed_by_fkey";
                columns: ["reviewed_by"];
                isOneToOne: false;
                referencedRelation: "users";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "fk_artworks_creator_id";
                columns: ["creator_id"];
                isOneToOne: false;
                referencedRelation: "users";
                referencedColumns: ["id"];
            }];
        };
        audit_logs: {
            Row: {
                action: string;
                created_at: string;
                id: string;
                ip_address: unknown;
                metadata: import("../common/types/database").Json;
                user_agent: string | null;
                user_id: string | null;
            };
            Insert: {
                action: string;
                created_at?: string;
                id?: string;
                ip_address?: unknown;
                metadata?: import("../common/types/database").Json;
                user_agent?: string | null;
                user_id?: string | null;
            };
            Update: {
                action?: string;
                created_at?: string;
                id?: string;
                ip_address?: unknown;
                metadata?: import("../common/types/database").Json;
                user_agent?: string | null;
                user_id?: string | null;
            };
            Relationships: [];
        };
        auth_sessions: {
            Row: {
                created_at: string;
                expires_at: string;
                id: string;
                ip_address: unknown;
                last_used_at: string;
                refresh_token_hash: string;
                revoked_at: string | null;
                user_agent: string | null;
                user_id: string;
            };
            Insert: {
                created_at?: string;
                expires_at: string;
                id?: string;
                ip_address?: unknown;
                last_used_at?: string;
                refresh_token_hash: string;
                revoked_at?: string | null;
                user_agent?: string | null;
                user_id: string;
            };
            Update: {
                created_at?: string;
                expires_at?: string;
                id?: string;
                ip_address?: unknown;
                last_used_at?: string;
                refresh_token_hash?: string;
                revoked_at?: string | null;
                user_agent?: string | null;
                user_id?: string;
            };
            Relationships: [{
                foreignKeyName: "auth_sessions_user_id_fkey";
                columns: ["user_id"];
                isOneToOne: false;
                referencedRelation: "users";
                referencedColumns: ["id"];
            }];
        };
        cart_items: {
            Row: {
                added_at: string;
                artwork_id: string;
                currency_at_add: string;
                id: string;
                price_at_add: number;
                quantity: number;
                user_id: string;
                variant_snapshot: import("../common/types/database").Json | null;
            };
            Insert: {
                added_at?: string;
                artwork_id: string;
                currency_at_add: string;
                id?: string;
                price_at_add: number;
                quantity?: number;
                user_id: string;
                variant_snapshot?: import("../common/types/database").Json | null;
            };
            Update: {
                added_at?: string;
                artwork_id?: string;
                currency_at_add?: string;
                id?: string;
                price_at_add?: number;
                quantity?: number;
                user_id?: string;
                variant_snapshot?: import("../common/types/database").Json | null;
            };
            Relationships: [{
                foreignKeyName: "cart_items_artwork_id_fkey";
                columns: ["artwork_id"];
                isOneToOne: false;
                referencedRelation: "artworks";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "cart_items_user_id_fkey";
                columns: ["user_id"];
                isOneToOne: false;
                referencedRelation: "users";
                referencedColumns: ["id"];
            }];
        };
        comments: {
            Row: {
                artwork_id: string;
                body: string;
                created_at: string;
                deleted_at: string | null;
                id: string;
                likes_count: number;
                parent_id: string | null;
                updated_at: string;
                user_id: string;
            };
            Insert: {
                artwork_id: string;
                body: string;
                created_at?: string;
                deleted_at?: string | null;
                id?: string;
                likes_count?: number;
                parent_id?: string | null;
                updated_at?: string;
                user_id: string;
            };
            Update: {
                artwork_id?: string;
                body?: string;
                created_at?: string;
                deleted_at?: string | null;
                id?: string;
                likes_count?: number;
                parent_id?: string | null;
                updated_at?: string;
                user_id?: string;
            };
            Relationships: [{
                foreignKeyName: "comments_artwork_id_fkey";
                columns: ["artwork_id"];
                isOneToOne: false;
                referencedRelation: "artworks";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "comments_parent_id_fkey";
                columns: ["parent_id"];
                isOneToOne: false;
                referencedRelation: "comments";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "comments_user_id_fkey";
                columns: ["user_id"];
                isOneToOne: false;
                referencedRelation: "users";
                referencedColumns: ["id"];
            }];
        };
        conversation_participants: {
            Row: {
                conversation_id: string;
                id: string;
                is_muted: boolean;
                joined_at: string;
                last_read_at: string;
                left_at: string | null;
                role: Database["public"]["Enums"]["participant_role"];
                user_id: string;
            };
            Insert: {
                conversation_id: string;
                id?: string;
                is_muted?: boolean;
                joined_at?: string;
                last_read_at?: string;
                left_at?: string | null;
                role?: Database["public"]["Enums"]["participant_role"];
                user_id: string;
            };
            Update: {
                conversation_id?: string;
                id?: string;
                is_muted?: boolean;
                joined_at?: string;
                last_read_at?: string;
                left_at?: string | null;
                role?: Database["public"]["Enums"]["participant_role"];
                user_id?: string;
            };
            Relationships: [{
                foreignKeyName: "conversation_participants_conversation_id_fkey";
                columns: ["conversation_id"];
                isOneToOne: false;
                referencedRelation: "conversations";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "conversation_participants_user_id_fkey";
                columns: ["user_id"];
                isOneToOne: false;
                referencedRelation: "users";
                referencedColumns: ["id"];
            }];
        };
        conversations: {
            Row: {
                created_at: string;
                created_by: string;
                id: string;
                last_activity_at: string;
                last_message_id: string | null;
                metadata: import("../common/types/database").Json;
                title: string | null;
                type: Database["public"]["Enums"]["conversation_type"];
                updated_at: string;
            };
            Insert: {
                created_at?: string;
                created_by: string;
                id?: string;
                last_activity_at?: string;
                last_message_id?: string | null;
                metadata?: import("../common/types/database").Json;
                title?: string | null;
                type?: Database["public"]["Enums"]["conversation_type"];
                updated_at?: string;
            };
            Update: {
                created_at?: string;
                created_by?: string;
                id?: string;
                last_activity_at?: string;
                last_message_id?: string | null;
                metadata?: import("../common/types/database").Json;
                title?: string | null;
                type?: Database["public"]["Enums"]["conversation_type"];
                updated_at?: string;
            };
            Relationships: [{
                foreignKeyName: "conversations_created_by_fkey";
                columns: ["created_by"];
                isOneToOne: false;
                referencedRelation: "users";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "conversations_last_message_id_fk";
                columns: ["last_message_id"];
                isOneToOne: false;
                referencedRelation: "messages";
                referencedColumns: ["id"];
            }];
        };
        digital_delivery_tokens: {
            Row: {
                artwork_id: string;
                buyer_id: string;
                created_at: string;
                download_count: number;
                expires_at: string;
                id: string;
                last_downloaded_at: string | null;
                max_downloads: number;
                order_item_id: string;
                token_hash: string;
            };
            Insert: {
                artwork_id: string;
                buyer_id: string;
                created_at?: string;
                download_count?: number;
                expires_at: string;
                id?: string;
                last_downloaded_at?: string | null;
                max_downloads?: number;
                order_item_id: string;
                token_hash: string;
            };
            Update: {
                artwork_id?: string;
                buyer_id?: string;
                created_at?: string;
                download_count?: number;
                expires_at?: string;
                id?: string;
                last_downloaded_at?: string | null;
                max_downloads?: number;
                order_item_id?: string;
                token_hash?: string;
            };
            Relationships: [{
                foreignKeyName: "digital_delivery_tokens_artwork_id_fkey";
                columns: ["artwork_id"];
                isOneToOne: false;
                referencedRelation: "artworks";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "digital_delivery_tokens_buyer_id_fkey";
                columns: ["buyer_id"];
                isOneToOne: false;
                referencedRelation: "users";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "digital_delivery_tokens_order_item_id_fkey";
                columns: ["order_item_id"];
                isOneToOne: true;
                referencedRelation: "order_items";
                referencedColumns: ["id"];
            }];
        };
        follows: {
            Row: {
                created_at: string;
                follower_id: string;
                following_id: string;
                id: string;
            };
            Insert: {
                created_at?: string;
                follower_id: string;
                following_id: string;
                id?: string;
            };
            Update: {
                created_at?: string;
                follower_id?: string;
                following_id?: string;
                id?: string;
            };
            Relationships: [{
                foreignKeyName: "follows_follower_id_fkey";
                columns: ["follower_id"];
                isOneToOne: false;
                referencedRelation: "users";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "follows_following_id_fkey";
                columns: ["following_id"];
                isOneToOne: false;
                referencedRelation: "users";
                referencedColumns: ["id"];
            }];
        };
        likes: {
            Row: {
                artwork_id: string;
                created_at: string;
                id: string;
                user_id: string;
            };
            Insert: {
                artwork_id: string;
                created_at?: string;
                id?: string;
                user_id: string;
            };
            Update: {
                artwork_id?: string;
                created_at?: string;
                id?: string;
                user_id?: string;
            };
            Relationships: [{
                foreignKeyName: "likes_artwork_id_fkey";
                columns: ["artwork_id"];
                isOneToOne: false;
                referencedRelation: "artworks";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "likes_user_id_fkey";
                columns: ["user_id"];
                isOneToOne: false;
                referencedRelation: "users";
                referencedColumns: ["id"];
            }];
        };
        message_reads: {
            Row: {
                id: string;
                message_id: string;
                read_at: string;
                user_id: string;
            };
            Insert: {
                id?: string;
                message_id: string;
                read_at?: string;
                user_id: string;
            };
            Update: {
                id?: string;
                message_id?: string;
                read_at?: string;
                user_id?: string;
            };
            Relationships: [{
                foreignKeyName: "message_reads_message_id_fkey";
                columns: ["message_id"];
                isOneToOne: false;
                referencedRelation: "messages";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "message_reads_user_id_fkey";
                columns: ["user_id"];
                isOneToOne: false;
                referencedRelation: "users";
                referencedColumns: ["id"];
            }];
        };
        messages: {
            Row: {
                body: string;
                conversation_id: string;
                created_at: string;
                deleted_at: string | null;
                edited_at: string | null;
                id: string;
                is_broadcast_root: boolean;
                metadata: import("../common/types/database").Json;
                reply_to_id: string | null;
                sender_id: string;
                type: Database["public"]["Enums"]["message_type"];
            };
            Insert: {
                body: string;
                conversation_id: string;
                created_at?: string;
                deleted_at?: string | null;
                edited_at?: string | null;
                id?: string;
                is_broadcast_root?: boolean;
                metadata?: import("../common/types/database").Json;
                reply_to_id?: string | null;
                sender_id: string;
                type?: Database["public"]["Enums"]["message_type"];
            };
            Update: {
                body?: string;
                conversation_id?: string;
                created_at?: string;
                deleted_at?: string | null;
                edited_at?: string | null;
                id?: string;
                is_broadcast_root?: boolean;
                metadata?: import("../common/types/database").Json;
                reply_to_id?: string | null;
                sender_id?: string;
                type?: Database["public"]["Enums"]["message_type"];
            };
            Relationships: [{
                foreignKeyName: "messages_conversation_id_fkey";
                columns: ["conversation_id"];
                isOneToOne: false;
                referencedRelation: "conversations";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "messages_reply_to_id_fkey";
                columns: ["reply_to_id"];
                isOneToOne: false;
                referencedRelation: "messages";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "messages_sender_id_fkey";
                columns: ["sender_id"];
                isOneToOne: false;
                referencedRelation: "users";
                referencedColumns: ["id"];
            }];
        };
        moodboard_items: {
            Row: {
                added_at: string;
                artwork_id: string;
                moodboard_id: string;
            };
            Insert: {
                added_at?: string;
                artwork_id: string;
                moodboard_id: string;
            };
            Update: {
                added_at?: string;
                artwork_id?: string;
                moodboard_id?: string;
            };
            Relationships: [{
                foreignKeyName: "moodboard_items_artwork_id_fkey";
                columns: ["artwork_id"];
                isOneToOne: false;
                referencedRelation: "artworks";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "moodboard_items_moodboard_id_fkey";
                columns: ["moodboard_id"];
                isOneToOne: false;
                referencedRelation: "moodboards";
                referencedColumns: ["id"];
            }];
        };
        moodboards: {
            Row: {
                created_at: string;
                id: string;
                title: string;
                updated_at: string;
                user_id: string;
            };
            Insert: {
                created_at?: string;
                id?: string;
                title: string;
                updated_at?: string;
                user_id: string;
            };
            Update: {
                created_at?: string;
                id?: string;
                title?: string;
                updated_at?: string;
                user_id?: string;
            };
            Relationships: [{
                foreignKeyName: "moodboards_user_id_fkey";
                columns: ["user_id"];
                isOneToOne: false;
                referencedRelation: "users";
                referencedColumns: ["id"];
            }];
        };
        notification_preferences: {
            Row: {
                email_enabled: boolean;
                id: string;
                push_enabled: boolean;
                types_muted: string[];
                updated_at: string;
                user_id: string;
                ws_enabled: boolean;
            };
            Insert: {
                email_enabled?: boolean;
                id?: string;
                push_enabled?: boolean;
                types_muted?: string[];
                updated_at?: string;
                user_id: string;
                ws_enabled?: boolean;
            };
            Update: {
                email_enabled?: boolean;
                id?: string;
                push_enabled?: boolean;
                types_muted?: string[];
                updated_at?: string;
                user_id?: string;
                ws_enabled?: boolean;
            };
            Relationships: [{
                foreignKeyName: "notification_preferences_user_id_fkey";
                columns: ["user_id"];
                isOneToOne: true;
                referencedRelation: "users";
                referencedColumns: ["id"];
            }];
        };
        notifications: {
            Row: {
                actor_id: string | null;
                created_at: string;
                data: import("../common/types/database").Json | null;
                entity_id: string | null;
                entity_type: string | null;
                id: string;
                is_read: boolean;
                recipient_id: string;
                type: Database["public"]["Enums"]["notification_type"];
            };
            Insert: {
                actor_id?: string | null;
                created_at?: string;
                data?: import("../common/types/database").Json | null;
                entity_id?: string | null;
                entity_type?: string | null;
                id?: string;
                is_read?: boolean;
                recipient_id: string;
                type: Database["public"]["Enums"]["notification_type"];
            };
            Update: {
                actor_id?: string | null;
                created_at?: string;
                data?: import("../common/types/database").Json | null;
                entity_id?: string | null;
                entity_type?: string | null;
                id?: string;
                is_read?: boolean;
                recipient_id?: string;
                type?: Database["public"]["Enums"]["notification_type"];
            };
            Relationships: [{
                foreignKeyName: "notifications_actor_id_fkey";
                columns: ["actor_id"];
                isOneToOne: false;
                referencedRelation: "users";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "notifications_recipient_id_fkey";
                columns: ["recipient_id"];
                isOneToOne: false;
                referencedRelation: "users";
                referencedColumns: ["id"];
            }];
        };
        order_items: {
            Row: {
                artwork_format: string;
                artwork_id: string;
                artwork_slug: string;
                artwork_thumbnail_url: string | null;
                artwork_title: string;
                created_at: string;
                currency: string;
                id: string;
                line_total: number;
                order_id: string;
                quantity: number;
                seller_id: string;
                unit_price: number;
                variant_snapshot: import("../common/types/database").Json | null;
            };
            Insert: {
                artwork_format: string;
                artwork_id: string;
                artwork_slug: string;
                artwork_thumbnail_url?: string | null;
                artwork_title: string;
                created_at?: string;
                currency: string;
                id?: string;
                line_total?: number;
                order_id: string;
                quantity?: number;
                seller_id: string;
                unit_price: number;
                variant_snapshot?: import("../common/types/database").Json | null;
            };
            Update: {
                artwork_format?: string;
                artwork_id?: string;
                artwork_slug?: string;
                artwork_thumbnail_url?: string | null;
                artwork_title?: string;
                created_at?: string;
                currency?: string;
                id?: string;
                line_total?: number;
                order_id?: string;
                quantity?: number;
                seller_id?: string;
                unit_price?: number;
                variant_snapshot?: import("../common/types/database").Json | null;
            };
            Relationships: [{
                foreignKeyName: "order_items_artwork_id_fkey";
                columns: ["artwork_id"];
                isOneToOne: false;
                referencedRelation: "artworks";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "order_items_order_id_fkey";
                columns: ["order_id"];
                isOneToOne: false;
                referencedRelation: "orders";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "order_items_seller_id_fkey";
                columns: ["seller_id"];
                isOneToOne: false;
                referencedRelation: "users";
                referencedColumns: ["id"];
            }];
        };
        orders: {
            Row: {
                buyer_id: string;
                created_at: string;
                currency: string;
                id: string;
                idempotency_key: string;
                notes: string | null;
                shipping_address: import("../common/types/database").Json | null;
                status: Database["public"]["Enums"]["order_status"];
                subtotal: number;
                updated_at: string;
            };
            Insert: {
                buyer_id: string;
                created_at?: string;
                currency?: string;
                id?: string;
                idempotency_key: string;
                notes?: string | null;
                shipping_address?: import("../common/types/database").Json | null;
                status?: Database["public"]["Enums"]["order_status"];
                subtotal: number;
                updated_at?: string;
            };
            Update: {
                buyer_id?: string;
                created_at?: string;
                currency?: string;
                id?: string;
                idempotency_key?: string;
                notes?: string | null;
                shipping_address?: import("../common/types/database").Json | null;
                status?: Database["public"]["Enums"]["order_status"];
                subtotal?: number;
                updated_at?: string;
            };
            Relationships: [{
                foreignKeyName: "orders_buyer_id_fkey";
                columns: ["buyer_id"];
                isOneToOne: false;
                referencedRelation: "users";
                referencedColumns: ["id"];
            }];
        };
        password_reset_tokens: {
            Row: {
                created_at: string;
                expires_at: string;
                id: string;
                reset_attempts: number;
                reset_email: string;
                reset_token_hash: string;
                used_at: string | null;
                user_id: string;
            };
            Insert: {
                created_at?: string;
                expires_at: string;
                id?: string;
                reset_attempts?: number;
                reset_email: string;
                reset_token_hash: string;
                used_at?: string | null;
                user_id: string;
            };
            Update: {
                created_at?: string;
                expires_at?: string;
                id?: string;
                reset_attempts?: number;
                reset_email?: string;
                reset_token_hash?: string;
                used_at?: string | null;
                user_id?: string;
            };
            Relationships: [{
                foreignKeyName: "password_reset_tokens_user_id_fkey";
                columns: ["user_id"];
                isOneToOne: false;
                referencedRelation: "users";
                referencedColumns: ["id"];
            }];
        };
        profiles: {
            Row: {
                artworks_count: number;
                avatar_url: string | null;
                bio: string | null;
                created_at: string;
                display_name: string | null;
                followers_count: number;
                following_count: number;
                id: string;
                location: string | null;
                sales_count: number;
                updated_at: string;
                user_id: string;
                username: string;
                website_url: string | null;
            };
            Insert: {
                artworks_count?: number;
                avatar_url?: string | null;
                bio?: string | null;
                created_at?: string;
                display_name?: string | null;
                followers_count?: number;
                following_count?: number;
                id?: string;
                location?: string | null;
                sales_count?: number;
                updated_at?: string;
                user_id: string;
                username: string;
                website_url?: string | null;
            };
            Update: {
                artworks_count?: number;
                avatar_url?: string | null;
                bio?: string | null;
                created_at?: string;
                display_name?: string | null;
                followers_count?: number;
                following_count?: number;
                id?: string;
                location?: string | null;
                sales_count?: number;
                updated_at?: string;
                user_id?: string;
                username?: string;
                website_url?: string | null;
            };
            Relationships: [{
                foreignKeyName: "profiles_user_id_fkey";
                columns: ["user_id"];
                isOneToOne: true;
                referencedRelation: "users";
                referencedColumns: ["id"];
            }];
        };
        saves: {
            Row: {
                artwork_id: string;
                created_at: string;
                id: string;
                user_id: string;
            };
            Insert: {
                artwork_id: string;
                created_at?: string;
                id?: string;
                user_id: string;
            };
            Update: {
                artwork_id?: string;
                created_at?: string;
                id?: string;
                user_id?: string;
            };
            Relationships: [{
                foreignKeyName: "saves_artwork_id_fkey";
                columns: ["artwork_id"];
                isOneToOne: false;
                referencedRelation: "artworks";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "saves_user_id_fkey";
                columns: ["user_id"];
                isOneToOne: false;
                referencedRelation: "users";
                referencedColumns: ["id"];
            }];
        };
        seller_registrations: {
            Row: {
                address: string;
                country: string;
                created_at: string;
                email: string;
                full_name: string;
                id: string;
                phone_number: string;
                postal_code: string | null;
                review_notes: string | null;
                reviewed_by: string | null;
                state: string;
                status: Database["public"]["Enums"]["seller_registration_status"];
                updated_at: string;
                user_id: string;
                username: string;
            };
            Insert: {
                address: string;
                country: string;
                created_at?: string;
                email: string;
                full_name: string;
                id?: string;
                phone_number: string;
                postal_code?: string | null;
                review_notes?: string | null;
                reviewed_by?: string | null;
                state: string;
                status?: Database["public"]["Enums"]["seller_registration_status"];
                updated_at?: string;
                user_id: string;
                username: string;
            };
            Update: {
                address?: string;
                country?: string;
                created_at?: string;
                email?: string;
                full_name?: string;
                id?: string;
                phone_number?: string;
                postal_code?: string | null;
                review_notes?: string | null;
                reviewed_by?: string | null;
                state?: string;
                status?: Database["public"]["Enums"]["seller_registration_status"];
                updated_at?: string;
                user_id?: string;
                username?: string;
            };
            Relationships: [{
                foreignKeyName: "seller_registrations_reviewed_by_fkey";
                columns: ["reviewed_by"];
                isOneToOne: false;
                referencedRelation: "users";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "seller_registrations_user_id_fkey";
                columns: ["user_id"];
                isOneToOne: true;
                referencedRelation: "users";
                referencedColumns: ["id"];
            }];
        };
        shipping_addresses: {
            Row: {
                address_line_1: string;
                address_line_2: string | null;
                city: string;
                country_code: string;
                created_at: string;
                full_name: string;
                id: string;
                is_default: boolean;
                label: string | null;
                phone: string;
                postal_code: string;
                state: string;
                updated_at: string;
                user_id: string;
            };
            Insert: {
                address_line_1: string;
                address_line_2?: string | null;
                city: string;
                country_code: string;
                created_at?: string;
                full_name: string;
                id?: string;
                is_default?: boolean;
                label?: string | null;
                phone: string;
                postal_code: string;
                state: string;
                updated_at?: string;
                user_id: string;
            };
            Update: {
                address_line_1?: string;
                address_line_2?: string | null;
                city?: string;
                country_code?: string;
                created_at?: string;
                full_name?: string;
                id?: string;
                is_default?: boolean;
                label?: string | null;
                phone?: string;
                postal_code?: string;
                state?: string;
                updated_at?: string;
                user_id?: string;
            };
            Relationships: [{
                foreignKeyName: "shipping_addresses_user_id_fkey";
                columns: ["user_id"];
                isOneToOne: false;
                referencedRelation: "users";
                referencedColumns: ["id"];
            }];
        };
        transactions: {
            Row: {
                amount: number;
                confirmation_block: number | null;
                confirmed_at: string | null;
                created_at: string;
                currency: string;
                expires_at: string;
                id: string;
                last_retry_at: string | null;
                network: Database["public"]["Enums"]["wallet_network"];
                order_id: string;
                recipient_wallet_address: string;
                retry_count: number;
                sender_wallet_address: string | null;
                status: Database["public"]["Enums"]["transaction_status"];
                tx_hash: string | null;
                updated_at: string;
            };
            Insert: {
                amount: number;
                confirmation_block?: number | null;
                confirmed_at?: string | null;
                created_at?: string;
                currency?: string;
                expires_at: string;
                id?: string;
                last_retry_at?: string | null;
                network?: Database["public"]["Enums"]["wallet_network"];
                order_id: string;
                recipient_wallet_address: string;
                retry_count?: number;
                sender_wallet_address?: string | null;
                status?: Database["public"]["Enums"]["transaction_status"];
                tx_hash?: string | null;
                updated_at?: string;
            };
            Update: {
                amount?: number;
                confirmation_block?: number | null;
                confirmed_at?: string | null;
                created_at?: string;
                currency?: string;
                expires_at?: string;
                id?: string;
                last_retry_at?: string | null;
                network?: Database["public"]["Enums"]["wallet_network"];
                order_id?: string;
                recipient_wallet_address?: string;
                retry_count?: number;
                sender_wallet_address?: string | null;
                status?: Database["public"]["Enums"]["transaction_status"];
                tx_hash?: string | null;
                updated_at?: string;
            };
            Relationships: [{
                foreignKeyName: "transactions_order_id_fkey";
                columns: ["order_id"];
                isOneToOne: true;
                referencedRelation: "orders";
                referencedColumns: ["id"];
            }];
        };
        users: {
            Row: {
                created_at: string;
                deleted_at: string | null;
                email: string;
                failed_login_attempts: number;
                id: string;
                interests: string[];
                is_email_verified: boolean;
                last_login_at: string | null;
                locked_until: string | null;
                onboarded: boolean;
                password_hash: string | null;
                provider: Database["public"]["Enums"]["auth_provider"];
                provider_id: string | null;
                role: Database["public"]["Enums"]["user_role"];
                status: Database["public"]["Enums"]["user_status"];
                token_version: number;
                updated_at: string;
                username: string;
            };
            Insert: {
                created_at?: string;
                deleted_at?: string | null;
                email: string;
                failed_login_attempts?: number;
                id?: string;
                interests?: string[];
                is_email_verified?: boolean;
                last_login_at?: string | null;
                locked_until?: string | null;
                onboarded?: boolean;
                password_hash?: string | null;
                provider?: Database["public"]["Enums"]["auth_provider"];
                provider_id?: string | null;
                role?: Database["public"]["Enums"]["user_role"];
                status?: Database["public"]["Enums"]["user_status"];
                token_version?: number;
                updated_at?: string;
                username: string;
            };
            Update: {
                created_at?: string;
                deleted_at?: string | null;
                email?: string;
                failed_login_attempts?: number;
                id?: string;
                interests?: string[];
                is_email_verified?: boolean;
                last_login_at?: string | null;
                locked_until?: string | null;
                onboarded?: boolean;
                password_hash?: string | null;
                provider?: Database["public"]["Enums"]["auth_provider"];
                provider_id?: string | null;
                role?: Database["public"]["Enums"]["user_role"];
                status?: Database["public"]["Enums"]["user_status"];
                token_version?: number;
                updated_at?: string;
                username?: string;
            };
            Relationships: [];
        };
        wallet_history: {
            Row: {
                amount: number;
                balance_after: number;
                created_at: string;
                description: string | null;
                id: string;
                transaction_id: string | null;
                type: string;
                user_id: string;
            };
            Insert: {
                amount: number;
                balance_after: number;
                created_at?: string;
                description?: string | null;
                id?: string;
                transaction_id?: string | null;
                type: string;
                user_id: string;
            };
            Update: {
                amount?: number;
                balance_after?: number;
                created_at?: string;
                description?: string | null;
                id?: string;
                transaction_id?: string | null;
                type?: string;
                user_id?: string;
            };
            Relationships: [{
                foreignKeyName: "wallet_history_transaction_id_fkey";
                columns: ["transaction_id"];
                isOneToOne: false;
                referencedRelation: "transactions";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "wallet_history_user_id_fkey";
                columns: ["user_id"];
                isOneToOne: false;
                referencedRelation: "users";
                referencedColumns: ["id"];
            }];
        };
        wallet_ledger: {
            Row: {
                amount: number;
                balance_after: number;
                created_at: string;
                description: string;
                id: string;
                order_id: string | null;
                transaction_id: string | null;
                type: Database["public"]["Enums"]["wallet_ledger_entry_type"];
                user_id: string;
            };
            Insert: {
                amount: number;
                balance_after: number;
                created_at?: string;
                description: string;
                id?: string;
                order_id?: string | null;
                transaction_id?: string | null;
                type: Database["public"]["Enums"]["wallet_ledger_entry_type"];
                user_id: string;
            };
            Update: {
                amount?: number;
                balance_after?: number;
                created_at?: string;
                description?: string;
                id?: string;
                order_id?: string | null;
                transaction_id?: string | null;
                type?: Database["public"]["Enums"]["wallet_ledger_entry_type"];
                user_id?: string;
            };
            Relationships: [{
                foreignKeyName: "wallet_ledger_order_id_fkey";
                columns: ["order_id"];
                isOneToOne: false;
                referencedRelation: "orders";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "wallet_ledger_transaction_id_fkey";
                columns: ["transaction_id"];
                isOneToOne: false;
                referencedRelation: "transactions";
                referencedColumns: ["id"];
            }, {
                foreignKeyName: "wallet_ledger_user_id_fkey";
                columns: ["user_id"];
                isOneToOne: false;
                referencedRelation: "users";
                referencedColumns: ["id"];
            }];
        };
    };
    Views: { [_ in never]: never; };
    Functions: {
        create_broadcast_conversation: {
            Args: {
                p_recipient_ids: string[];
                p_sender_id: string;
                p_title: string;
            };
            Returns: string;
        };
        generate_artwork_slug: {
            Args: {
                p_creator_id: string;
                p_title: string;
            };
            Returns: string;
        };
        get_conversation_unread_counts: {
            Args: {
                p_user_id: string;
            };
            Returns: {
                conversation_id: string;
                unread_count: number;
            }[];
        };
        get_conversation_with_participants: {
            Args: {
                p_conversation_id: string;
                p_requesting_user: string;
            };
            Returns: {
                created_at: string;
                created_by: string;
                id: string;
                last_activity_at: string;
                last_message_id: string;
                metadata: import("../common/types/database").Json;
                participants: import("../common/types/database").Json;
                title: string;
                type: Database["public"]["Enums"]["conversation_type"];
                unread_count: number;
            }[];
        };
        get_or_create_direct_conversation: {
            Args: {
                p_user_a: string;
                p_user_b: string;
            };
            Returns: string;
        };
        increment_artwork_view_count: {
            Args: {
                p_artwork_id: string;
            };
            Returns: undefined;
        };
        increment_failed_login_attempts: {
            Args: {
                user_id: string;
            };
            Returns: undefined;
        };
        increment_reset_attempts: {
            Args: {
                token_id: string;
            };
            Returns: undefined;
        };
        increment_token_version: {
            Args: {
                user_id: string;
            };
            Returns: number;
        };
        leave_conversation: {
            Args: {
                p_conversation_id: string;
                p_user_id: string;
            };
            Returns: undefined;
        };
        mark_messages_read: {
            Args: {
                p_conversation_id: string;
                p_up_to_message_id: string;
                p_user_id: string;
            };
            Returns: number;
        };
        release_artwork_stock: {
            Args: {
                p_artwork_id: string;
                p_quantity: number;
                p_variant_option_id?: string;
            };
            Returns: undefined;
        };
        reserve_artwork_stock: {
            Args: {
                p_artwork_id: string;
                p_quantity: number;
                p_variant_option_id?: string;
            };
            Returns: boolean;
        };
        rotate_session: {
            Args: {
                p_expires_at: string;
                p_ip_address: string;
                p_new_token_hash: string;
                p_old_session_id: string;
                p_user_agent: string;
                p_user_id: string;
            };
            Returns: {
                created_at: string;
                expires_at: string;
                id: string;
                ip_address: unknown;
                last_used_at: string;
                refresh_token_hash: string;
                revoked_at: string | null;
                user_agent: string | null;
                user_id: string;
            }[];
            SetofOptions: {
                from: "*";
                to: "auth_sessions";
                isOneToOne: false;
                isSetofReturn: true;
            };
        };
        search_conversations: {
            Args: {
                p_limit?: number;
                p_query: string;
                p_user_id: string;
            };
            Returns: {
                conversation_id: string;
                last_activity_at: string;
                last_message_id: string;
                title: string;
                type: Database["public"]["Enums"]["conversation_type"];
                unread_count: number;
            }[];
        };
        search_messages: {
            Args: {
                p_before_id?: string;
                p_conversation_id: string;
                p_limit?: number;
                p_query: string;
                p_user_id: string;
            };
            Returns: {
                body: string;
                conversation_id: string;
                created_at: string;
                edited_at: string;
                id: string;
                metadata: import("../common/types/database").Json;
                reply_to_id: string;
                sender_id: string;
                similarity_rank: number;
                type: Database["public"]["Enums"]["message_type"];
            }[];
        };
        show_limit: {
            Args: never;
            Returns: number;
        };
        show_trgm: {
            Args: {
                "": string;
            };
            Returns: string[];
        };
        submit_seller_registration: {
            Args: {
                p_address: string;
                p_country: string;
                p_email: string;
                p_full_name: string;
                p_phone_number: string;
                p_postal_code?: string;
                p_state: string;
                p_user_id: string;
                p_username: string;
            };
            Returns: {
                address: string;
                country: string;
                created_at: string;
                email: string;
                full_name: string;
                id: string;
                phone_number: string;
                postal_code: string | null;
                review_notes: string | null;
                reviewed_by: string | null;
                state: string;
                status: Database["public"]["Enums"]["seller_registration_status"];
                updated_at: string;
                user_id: string;
                username: string;
            }[];
            SetofOptions: {
                from: "*";
                to: "seller_registrations";
                isOneToOne: false;
                isSetofReturn: true;
            };
        };
        transition_seller_registration: {
            Args: {
                p_admin_id: string;
                p_new_status: Database["public"]["Enums"]["seller_registration_status"];
                p_notes?: string;
                p_registration_id: string;
            };
            Returns: {
                address: string;
                country: string;
                created_at: string;
                email: string;
                full_name: string;
                id: string;
                phone_number: string;
                postal_code: string | null;
                review_notes: string | null;
                reviewed_by: string | null;
                state: string;
                status: Database["public"]["Enums"]["seller_registration_status"];
                updated_at: string;
                user_id: string;
                username: string;
            }[];
            SetofOptions: {
                from: "*";
                to: "seller_registrations";
                isOneToOne: false;
                isSetofReturn: true;
            };
        };
        unaccent: {
            Args: {
                "": string;
            };
            Returns: string;
        };
    };
    Enums: {
        artwork_availability: "available" | "sold" | "reserved" | "not_for_sale";
        artwork_category: "painting" | "digital" | "photography" | "sculpture" | "illustration" | "mixed_media" | "print" | "other";
        artwork_format: "DIGITAL" | "PHYSICAL";
        artwork_media_type: "IMAGE" | "VIDEO" | "THREE_D" | "EXTERNAL_LINK";
        artwork_status: "DRAFT" | "PUBLISHED" | "ARCHIVED" | "UNDER_REVIEW" | "PAUSED";
        artwork_visibility: "PUBLIC" | "PRIVATE" | "UNLISTED";
        auth_provider: "local" | "google" | "facebook";
        conversation_type: "direct" | "broadcast";
        listing_type: "MARKETPLACE" | "PORTFOLIO";
        message_type: "text" | "image" | "system";
        moderation_status: "PENDING" | "APPROVED" | "REJECTED" | "FLAGGED";
        notification_type: "like" | "comment" | "follow" | "mention" | "reply" | "sale" | "system" | "message" | "broadcast";
        order_status: "PENDING_PAYMENT" | "PAYMENT_CONFIRMED" | "PROCESSING" | "SHIPPED" | "FULFILLED" | "COMPLETED" | "CANCELLED" | "REFUNDED";
        participant_role: "owner" | "member";
        seller_registration_status: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
        transaction_status: "PENDING" | "CONFIRMING" | "CONFIRMED" | "FAILED" | "EXPIRED";
        user_role: "USER" | "ARTIST" | "MODERATOR" | "ADMIN";
        user_status: "ACTIVE" | "SUSPENDED" | "DELETED";
        wallet_ledger_entry_type: "CREDIT" | "DEBIT";
        wallet_network: "TRON" | "ETHEREUM" | "BSC";
    };
    CompositeTypes: { [_ in never]: never; };
}, {
    PostgrestVersion: "14.5";
}>;
export declare function assertNoError<T>(result: {
    data: T | null;
    error: {
        message: string;
        code?: string;
        details?: string;
    } | null;
}, context: string): T;
export declare function assertNoErrorMany<T>(result: {
    data: T[] | null;
    error: {
        message: string;
    } | null;
}, context: string): T[];
//# sourceMappingURL=database.d.ts.map