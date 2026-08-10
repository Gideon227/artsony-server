import { supabase, assertNoError, assertNoErrorMany } from '@/config/database'
import type {
  CartItem,
  CartItemWithArtwork,
  CartVariantSnapshot,
} from '@/common/types/commerce.types'

// ── Row → Domain mappers ──────────────────────────────────────────────────────

function toCartItem(row: any): CartItem {
  return {
    id: row['id'],
    user_id: row['user_id'],
    artwork_id: row['artwork_id'],
    quantity: row['quantity'],
    price_at_add: Number(row['price_at_add']),
    currency_at_add:  row['currency_at_add'],
    variant_snapshot: (row['variant_snapshot'] ?? null) as CartVariantSnapshot | null,
    added_at: new Date(row['added_at']),
  }
}

// artworks has no flat thumbnail_url column — images live inside the assets
// JSONB array, ordered by ordering_index. Mirrors artwork.repository.ts's
// pickThumbnail so cart rows actually render an image.
function pickThumbnail(assets: any): string | null {
  const list = Array.isArray(assets) ? assets : []
  if (!list.length) return null
  const primary = [...list].sort((a, b) => (a?.ordering_index ?? 0) - (b?.ordering_index ?? 0))[0]
  return primary?.thumbnail_url ?? primary?.optimized_url ?? primary?.original_url ?? null
}

// Enriched: joins artwork + seller profile. Supabase select syntax handles
// the join — we map both the cart item fields and the nested artwork shape.
function toCartItemWithArtwork(row: any): CartItemWithArtwork {
  const artwork = row['artwork']
  // Safely extract the nested profile
  const profile = artwork['creator']?.['profile']

  return {
    ...toCartItem(row),
    artwork: {
      id: artwork['id'],
      title: artwork['title'],
      slug: artwork['slug'],
      thumbnail_url: pickThumbnail(artwork['assets']),
      artwork_format: artwork['artwork_format'],
      listing_type: artwork['listing_type'],
      status: artwork['status'],
      moderation_status: artwork['moderation_status'],
      price: artwork['price'] !== null ? Number(artwork['price']) : null,
      currency: artwork['currency'],
      max_purchase_quantity: artwork['max_purchase_quantity'] ?? null,
      has_variants: artwork['has_variants'],
      
      // Update these three lines to navigate into the profile object
      seller_id: artwork['creator']?.['id'] ?? null,
      seller_name: profile?.['display_name'] ?? artwork['creator']?.['username'] ?? '',
      seller_avatar_url: profile?.['avatar_url'] ?? null,
    },
    is_price_changed: false,
    is_unavailable: false,
    is_stock_insufficient:  false,
  }
}

// ── Repository ────────────────────────────────────────────────────────────────

export const cartRepository = {

  // ── FindByUser ─────────────────────────────────────────────────────────────
  // Returns all cart items for the user joined with the artwork and its
  // creator profile. Ordered by most recently added first.

  async findByUser(userId: string): Promise<CartItemWithArtwork[]> {
    const result = await (supabase() as any)
      .from('cart_items')
      .select(`
        *,
        artwork:artworks!cart_items_artwork_id_fkey (
          *,
          creator:users!artworks_creator_id_fkey (
            id,
            role,
            profile:profiles!profiles_user_id_fkey (
              username,
              display_name,
              avatar_url,
              followers_count,
              following_count,
              artworks_count,
              sales_count
            )
          )
        )
      `)
      .eq('user_id', userId)
      .order('added_at', { ascending: false })

    assertNoErrorMany(result, 'cart.findByUser')
    return (result.data ?? []).map(toCartItemWithArtwork)
  },

  // ── FindItemById ───────────────────────────────────────────────────────────

  async findItemById(itemId: string, userId: string): Promise<CartItem | undefined> {
    const result = await (supabase() as any)
      .from('cart_items')
      .select('*')
      .eq('id', itemId)
      .eq('user_id', userId)
      .single()

    if (result.error?.code === 'PGRST116') return undefined
    assertNoError(result, 'cart.findItemById')
    return toCartItem(result.data)
  },

  // ── CountByUser ────────────────────────────────────────────────────────────

  async countByUser(userId: string): Promise<number> {
    const result = await (supabase() as any)
      .from('cart_items')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)

    if (result.error) return 0
    return result.count ?? 0
  },

  // ── FindExistingLine ───────────────────────────────────────────────────────
  // Finds a specific (user, artwork, variant_option_id) combination.
  // Used to detect duplicates before inserting — digital artworks can only
  // have one row, physical artworks with the same variant also consolidate.

  async findExistingLine(
    userId: string,
    artworkId: string,
    variantOptionId: string | null,
  ): Promise<CartItem | undefined> {
    let query = (supabase() as any)
      .from('cart_items')
      .select('*')
      .eq('user_id', userId)
      .eq('artwork_id', artworkId)

    // The unique constraint in the DB uses (variant_snapshot->>'option_id').
    // We mirror that logic here for the pre-insert check.
    if (variantOptionId) {
      query = query.eq("variant_snapshot->>'option_id'", variantOptionId)
    } else {
      query = query.is('variant_snapshot', null)
    }

    const result = await query.maybeSingle()

    if (result.error?.code === 'PGRST116') return undefined
    if (result.error) return undefined
    if (!result.data) return undefined
    return toCartItem(result.data)
  },

  // ── Upsert ─────────────────────────────────────────────────────────────────
  // Inserts a new cart row or updates quantity on conflict.
  // The DB unique constraint on (user_id, artwork_id, option_id) backs this up.

  async upsert(payload: {
    user_id:          string
    artwork_id:       string
    quantity:         number
    price_at_add:     number
    currency_at_add:  string
    variant_snapshot: CartVariantSnapshot | null
  }): Promise<CartItem> {
    const result = await (supabase() as any)
      .from('cart_items')
      .upsert(
        {
          user_id:          payload.user_id,
          artwork_id:       payload.artwork_id,
          quantity:         payload.quantity,
          price_at_add:     payload.price_at_add,
          currency_at_add:  payload.currency_at_add,
          variant_snapshot: payload.variant_snapshot,
        },
        {
          onConflict: 'user_id,artwork_id',
          ignoreDuplicates: false,
        },
      )
      .select('*')
      .single()

    assertNoError(result, 'cart.upsert')
    return toCartItem(result.data)
  },

  // ── Insert ─────────────────────────────────────────────────────────────────

  async insert(payload: {
    user_id:          string
    artwork_id:       string
    quantity:         number
    price_at_add:     number
    currency_at_add:  string
    variant_snapshot: CartVariantSnapshot | null
  }): Promise<CartItem> {
    const result = await (supabase() as any)
      .from('cart_items')
      .insert(payload)
      .select('*')
      .single()

    assertNoError(result, 'cart.insert')
    return toCartItem(result.data)
  },

  // ── UpdateQuantity ─────────────────────────────────────────────────────────

  async updateQuantity(itemId: string, userId: string, quantity: number): Promise<CartItem> {
    const result = await (supabase() as any)
      .from('cart_items')
      .update({ quantity })
      .eq('id', itemId)
      .eq('user_id', userId)
      .select('*')
      .single()

    assertNoError(result, 'cart.updateQuantity')
    return toCartItem(result.data)
  },

  // ── DeleteItem ─────────────────────────────────────────────────────────────

  async deleteItem(itemId: string, userId: string): Promise<void> {
    const result = await (supabase() as any)
      .from('cart_items')
      .delete()
      .eq('id', itemId)
      .eq('user_id', userId)

    if (result.error) {
      throw new Error(`[Supabase:cart.deleteItem] ${result.error.message}`)
    }
  },

  // ── DeleteItems ────────────────────────────────────────────────────────────
  // Removes a specific set of items by ID for a given user.
  // Called after a successful checkout to clear purchased items only.

  async deleteItems(itemIds: string[], userId: string): Promise<void> {
    if (!itemIds.length) return

    const result = await (supabase() as any)
      .from('cart_items')
      .delete()
      .in('id', itemIds)
      .eq('user_id', userId)

    if (result.error) {
      throw new Error(`[Supabase:cart.deleteItems] ${result.error.message}`)
    }
  },

  // ── ClearCart ──────────────────────────────────────────────────────────────
  // Removes all items for a user — called after full checkout.

  async clearCart(userId: string): Promise<void> {
    const result = await (supabase() as any)
      .from('cart_items')
      .delete()
      .eq('user_id', userId)

    if (result.error) {
      throw new Error(`[Supabase:cart.clearCart] ${result.error.message}`)
    }
  },
}