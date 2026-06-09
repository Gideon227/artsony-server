import { v4 as uuidv4 } from 'uuid'
import { supabase, assertNoError } from '@/config/database'
import type {
  Artwork,
  ArtworkAsset,
  ArtworkFilters,
  PaginatedArtworks,
  PhysicalDetails,
  Variant,
  CreateArtworkInput,
  UpdateArtworkInput,
} from '@/common/types/artwork.types'

// ── Row → Domain mapper ───────────────────────────────────────────────────────

function toArtwork(row: any): Artwork {
  return {
    ['id']: row['id'],
    ['listing_type']: row['listing_type'],
    ['artwork_format']: row['artwork_format'],
    ['title']: row['title'],
    ['description']: row['description'],
    ['slug']: row['slug'],
    ['categories']: row['categories'] ?? [],
    ['keywords']: row['keywords'] ?? [],
    ['creator_id']: row['creator_id'],
    ['creator']: row['creator'],
    ['collaborator_ids']: row['collaborator_ids'] ?? [],
    ['tools_used']: row['tools_used'] ?? [],
    ['assets']: (row['assets'] ?? []) as ArtworkAsset[],
    ['visibility']: row['visibility'],
    ['allow_moodboard_save']:  row['allow_moodboard_save'],
    ['allow_comments']: row['allow_comments'],
    ['allow_likes']: row['allow_likes'],
    ['show_engagement_stats']: row['show_engagement_stats'],
    ['status']: row['status'],
    ['is_flagged']: row['is_flagged'],
    ['moderation_status']: row['moderation_status'],
    ['reviewed_by']: row['reviewed_by'] ?? null,
    ['review_notes']: row['review_notes'] ?? null,
    ['price']: row['price'] !== null ? Number(row['price']) : null,
    ['currency']: row['currency'],
    ['max_purchase_quantity']: row['max_purchase_quantity'] ?? null,
    ['physical_details']: (row['physical_details'] ?? null) as PhysicalDetails | null,
    ['has_variants']: row['has_variants'],
    ['variants']: (row['variants'] ?? []) as Variant[],
    ['view_count']: row['view_count'],
    ['like_count']: row['like_count'],
    ['save_count']: row['save_count'],
    ['comment_count']: row['comment_count'],
    ['purchase_count']: row['purchase_count'] ?? 0,
    ['created_at']: new Date(row['created_at']),
    ['updated_at']: new Date(row['updated_at']),
    ['deleted_at']: row['deleted_at'] ? new Date(row['deleted_at']) : null,
  }
}

// ── Repository ────────────────────────────────────────────────────────────────

export const artworkRepository = {

  // ── Create ─────────────────────────────────────────────────────────────────

  async create(
    input: CreateArtworkInput,
    creatorId: string,
    slug: string,
  ): Promise<Artwork> {
    const assetsWithIds = input.assets.map((a, i) => ({
      ...a,
      id: uuidv4(),
      ordering_index: a.ordering_index ?? i,
    }))

    const variantsWithIds = (input.variants ?? []).map(v => ({
      ...v,
      id: uuidv4(),
      options: v.options.map(o => ({ ...o, id: uuidv4() })),
    }))

    const payload: Record<string, any> = {
      ['listing_type']: input.listing_type,
      ['artwork_format']: input.artwork_format,
      ['title']: input.title,
      ['description']: input.description,
      ['slug']: slug,
      ['categories']: input.categories,
      ['keywords']: input.keywords,
      ['creator_id']: creatorId,
      ['collaborator_ids']: input.collaborator_ids,
      ['tools_used']: input.tools_used,
      ['assets']: JSON.stringify(assetsWithIds),
      ['visibility']: input.visibility,
      ['allow_moodboard_save']:  input.allow_moodboard_save,
      ['allow_comments']: input.allow_comments,
      ['allow_likes']: input.allow_likes,
      ['show_engagement_stats']: input.show_engagement_stats,
      ['status']: input.status ?? 'DRAFT',
      ['moderation_status']: 'PENDING',
      ['is_flagged']: false,
      ['currency']: input.currency ?? 'USD',
      ['has_variants']: input.has_variants,
      ['variants']: JSON.stringify(variantsWithIds),
    }

    if (input.price !== undefined) payload['price'] = input.price
    if (input.max_purchase_quantity !== undefined) payload['max_purchase_quantity'] = input.max_purchase_quantity
    if (input.physical_details) payload['physical_details'] = JSON.stringify(input.physical_details)

    const result = await (supabase() as any)
      .from('artworks')
      .insert(payload)
      .select('*')
      .single()

    assertNoError(result, 'artwork.create')
    return toArtwork(result.data)
  },

  // ── FindById ───────────────────────────────────────────────────────────────

  async findById(id: string): Promise<Artwork | undefined> {
    const result = await (supabase() as any)
      .from('artworks')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single()

    if (result.error?.code === 'PGRST116') return undefined
    assertNoError(result, 'artwork.findById')
    return toArtwork(result.data)
  },

  // ── FindBySlug ─────────────────────────────────────────────────────────────

  async findBySlug(slug: string): Promise<Artwork | undefined> {
    const result = await (supabase() as any)
      .from('artworks')
      .select('*')
      .eq('slug', slug)
      .is('deleted_at', null)
      .single()

    if (result.error?.code === 'PGRST116') return undefined
    assertNoError(result, 'artwork.findBySlug')
    return toArtwork(result.data)
  },

  // ── Update (SECURED WITH DEEP MERGE) ───────────────────────────────────────

  async update(id: string, input: UpdateArtworkInput): Promise<Artwork> {
    // 1. Fetch the existing record to prevent JSONB overwriting loops
    const existing = await this.findById(id)
    if (!existing) {
      throw new Error(`[Supabase:artwork.update] Artwork not found for id ${id}`)
    }

    const payload: Record<string, any> = {
      ['updated_at']: new Date().toISOString(),
    }

    // Standard primitive fields map directly
    if (input.title !== undefined)                payload['title']                 = input.title
    if (input.description !== undefined)          payload['description']           = input.description
    if (input.categories !== undefined)           payload['categories']            = input.categories
    if (input.keywords !== undefined)             payload['keywords']              = input.keywords
    if (input.collaborator_ids !== undefined)     payload['collaborator_ids']      = input.collaborator_ids
    if (input.tools_used !== undefined)           payload['tools_used']            = input.tools_used
    if (input.visibility !== undefined)           payload['visibility']            = input.visibility
    if (input.allow_moodboard_save !== undefined) payload['allow_moodboard_save']  = input.allow_moodboard_save
    if (input.allow_comments !== undefined)       payload['allow_comments']        = input.allow_comments
    if (input.allow_likes !== undefined)          payload['allow_likes']           = input.allow_likes
    if (input.show_engagement_stats !== undefined)payload['show_engagement_stats'] = input.show_engagement_stats
    if (input.price !== undefined)                payload['price']                 = input.price
    if (input.currency !== undefined)             payload['currency']              = input.currency
    if (input.max_purchase_quantity !== undefined)payload['max_purchase_quantity'] = input.max_purchase_quantity
    if (input.has_variants !== undefined)         payload['has_variants']          = input.has_variants

    // 2. Safe Array Merge for Assets
    if (input.assets !== undefined) {
      const existingAssetsMap = new Map(existing.assets.map(a => [a.id, a]))
      const mergedAssets = input.assets.map((inputAsset, i) => {
        const assetId = (inputAsset as any).id
        const existingAsset = assetId ? existingAssetsMap.get(assetId) : null
        
        return existingAsset 
          ? { ...existingAsset, ...inputAsset, ordering_index: inputAsset.ordering_index ?? existingAsset.ordering_index }
          : { ...inputAsset, id: assetId ?? uuidv4(), ordering_index: inputAsset.ordering_index ?? i }
      })

      // Retain existing assets that were completely omitted from the update payload
      const inputAssetIds = new Set(mergedAssets.map(a => a.id))
      const omittedAssets = existing.assets.filter(a => !inputAssetIds.has(a.id))
      
      payload['assets'] = JSON.stringify([...mergedAssets, ...omittedAssets])
    }

    // 3. Safe Nested Array Merge for Variants and their Options
    if (input.variants !== undefined) {
      const existingVariantsMap = new Map(existing.variants.map(v => [v.id, v]))
      
      const mergedVariants = input.variants.map(inputVariant => {
        const variantId = (inputVariant as any).id
        const existingVariant = variantId ? existingVariantsMap.get(variantId) : null

        if (existingVariant) {
          const existingOptionsMap = new Map(existingVariant.options.map((o: any) => [o.id, o]))
          const mergedOptions = inputVariant.options.map((inputOption: any) => {
            const optionId = inputOption.id
            const existingOption = optionId ? existingOptionsMap.get(optionId) : null
            return existingOption 
              ? { ...existingOption, ...inputOption } 
              : { ...inputOption, id: uuidv4() }
          })

          const inputOptionIds = new Set(mergedOptions.map(o => o.id))
          const omittedOptions = existingVariant.options.filter((o: any) => !inputOptionIds.has(o.id))

          return {
            ...existingVariant,
            ...inputVariant,
            id: variantId,
            options: [...mergedOptions, ...omittedOptions]
          }
        } else {
          // Brand new variant
          return {
            ...inputVariant,
            id: variantId ?? uuidv4(),
            options: inputVariant.options.map(o => ({ ...o, id: (o as any).id ?? uuidv4() }))
          }
        }
      })

      // Retain existing variants that were omitted from the update payload
      const inputVariantIds = new Set(mergedVariants.map(v => v.id))
      const omittedVariants = existing.variants.filter(v => !inputVariantIds.has(v.id))

      payload['variants'] = JSON.stringify([...mergedVariants, ...omittedVariants])
    }

    // 4. Safe Object Merge for Physical Details
    if (input.physical_details !== undefined) {
      if (input.physical_details === null) {
        payload['physical_details'] = null
      } else {
        const mergedPhysicalDetails = {
          ...(existing.physical_details || {}),
          ...input.physical_details
        }
        payload['physical_details'] = JSON.stringify(mergedPhysicalDetails)
      }
    }

    const result = await (supabase() as any)
      .from('artworks')
      .update(payload)
      .eq('id', id)
      .is('deleted_at', null)
      .select('*')
      .single()

    assertNoError(result, 'artwork.update')
    return toArtwork(result.data)
  },

  // ── UpdateStatus ───────────────────────────────────────────────────────────

  async updateStatus(
    id: string,
    status: Artwork['status'],
    moderationStatus?: Artwork['moderation_status'],
  ): Promise<Artwork> {
    const payload: Record<string, any> = {
      ['status']:     status,
      ['updated_at']: new Date().toISOString(),
    }
    if (moderationStatus) payload['moderation_status'] = moderationStatus

    const result = await (supabase() as any)
      .from('artworks')
      .update(payload)
      .eq('id', id)
      .is('deleted_at', null)
      .select('*')
      .single()

    assertNoError(result, 'artwork.updateStatus')
    return toArtwork(result.data)
  },

  // ── SoftDelete ─────────────────────────────────────────────────────────────

  async softDelete(id: string): Promise<void> {
    const result = await (supabase() as any)
      .from('artworks')
      .update({
        ['deleted_at']: new Date().toISOString(),
        ['status']:     'ARCHIVED',
        ['updated_at']: new Date().toISOString(),
      })
      .eq('id', id)

    if (result.error) {
      throw new Error(`[Supabase:artwork.softDelete] ${result.error.message}`)
    }
  },

  // ── GenerateSlug ───────────────────────────────────────────────────────────

  async generateSlug(title: string, creatorId: string): Promise<string> {
    const result = await (supabase() as any)
      .rpc('generate_artwork_slug', {
        p_title:      title,
        p_creator_id: creatorId,
      })

    if (result.error) {
      throw new Error(`[Supabase:artwork.generateSlug] ${result.error.message}`)
    }
    return result.data as string
  },

  // ── IncrementViewCount ─────────────────────────────────────────────────────

  async incrementViewCount(id: string): Promise<void> {
    const result = await (supabase() as any)
      .rpc('increment_artwork_view_count', { p_artwork_id: id })

    if (result.error) {
      throw new Error(`[Supabase:artwork.incrementViewCount] ${result.error.message}`)
    }
  },

  // ── List ───────────────────────────────────────────────────────────────────

  async list(filters: ArtworkFilters): Promise<PaginatedArtworks> {
    const page  = Math.max(1, filters.page  ?? 1)
    const limit = Math.min(50, Math.max(1, filters.limit ?? 20))
    const from  = (page - 1) * limit
    const to    = from + limit - 1

    let query = (supabase() as any)
      .from('artworks')
      .select(`
        *,
        creator:profiles!artworks_creator_id_fkey (
            id,
            name,
            avatar_url,
            role,
            stats,
            recent_artworks:artworks(optimized_url) // Example of deeply nested relation
        )
      `, { count: 'exact' })
      .is('deleted_at', null)

    if (filters.creator_id)    query = query.eq('creator_id', filters.creator_id)
    if (filters.listing_type)  query = query.eq('listing_type', filters.listing_type)
    if (filters.artwork_format)query = query.eq('artwork_format', filters.artwork_format)
    if (filters.status)        query = query.eq('status', filters.status)
    if (filters.visibility)    query = query.eq('visibility', filters.visibility)
    if (filters.min_price !== undefined) query = query.gte('price', filters.min_price)
    if (filters.max_price !== undefined) query = query.lte('price', filters.max_price)

    if (filters.categories?.length) {
      query = query.contains('categories', filters.categories)
    }

    if (filters.search?.trim()) {
      query = query.textSearch('search_vector', filters.search.trim(), {
        type: 'plain',
        config: 'english',
      })
    }

    const sortColumn = filters.sort_by    ?? 'created_at'
    const sortOrder  = filters.sort_order ?? 'desc'
    query = query.order(sortColumn, { ascending: sortOrder === 'asc' })

    query = query.range(from, to)

    const result = await query

    if (result.error) {
      throw new Error(`[Supabase:artwork.list] ${result.error.message}`)
    }

    const total       = result.count ?? 0
    const total_pages = Math.ceil(total / limit)

    return {
      data:        (result.data ?? []).map(toArtwork),
      total,
      page,
      limit,
      total_pages,
      has_next:    page < total_pages,
      has_prev:    page > 1,
    }
  },

  // ── Flag ───────────────────────────────────────────────────────────────────

  async flag(
    id: string,
    reviewerId: string,
    notes: string,
    moderationStatus: Artwork['moderation_status'],
  ): Promise<Artwork> {
    const result = await (supabase() as any)
      .from('artworks')
      .update({
        ['is_flagged']:        true,
        ['moderation_status']: moderationStatus,
        ['reviewed_by']:       reviewerId,
        ['review_notes']:      notes,
        ['updated_at']:        new Date().toISOString(),
      })
      .eq('id', id)
      .is('deleted_at', null)
      .select('*')
      .single()

    assertNoError(result, 'artwork.flag')
    return toArtwork(result.data)
  },

  // ── FindPurchasableById ────────────────────────────────────────────────────
  // Used by the cart and checkout services. Returns undefined when the artwork
  // exists but is not currently purchasable, so callers get a clean signal
  // without having to re-implement the purchasability predicate.

  async findPurchasableById(id: string): Promise<Artwork | undefined> {
    const result = await (supabase() as any)
      .from('artworks')
      .select('*')
      .eq('id', id)
      .eq('listing_type', 'MARKETPLACE')
      .eq('status', 'PUBLISHED')
      .eq('moderation_status', 'APPROVED')
      .eq('visibility', 'PUBLIC')
      .eq('is_flagged', false)
      .is('deleted_at', null)
      .single()

    if (result.error?.code === 'PGRST116') return undefined
    assertNoError(result, 'artwork.findPurchasableById')
    return toArtwork(result.data)
  },

  // ── HasActiveOrders ────────────────────────────────────────────────────────
  // Returns true when at least one non-terminal order_item row exists for the
  // artwork joined to an order in an active status.
  //
  // Uses a two-step approach: fetch active order IDs first, then check whether
  // any order_item for this artwork belongs to one of those orders. Supabase's
  // JS client cannot express cross-table WHERE filters in a single count query.

  async hasActiveOrders(artworkId: string): Promise<boolean> {
    const activeStatuses = [
      'PENDING_PAYMENT',
      'PAYMENT_CONFIRMED',
      'PROCESSING',
      'SHIPPED',
    ]

    // Step 1 — collect IDs of orders that are currently in an active state
    const orderResult = await (supabase() as any)
      .from('orders')
      .select('id')
      .in('status', activeStatuses)

    if (orderResult.error || !orderResult.data?.length) return false

    const activeOrderIds = (orderResult.data as { id: string }[]).map(r => r.id)

    // Step 2 — check whether this artwork appears in any of those orders
    const itemResult = await (supabase() as any)
      .from('order_items')
      .select('id', { count: 'exact', head: true })
      .eq('artwork_id', artworkId)
      .in('order_id', activeOrderIds)

    if (itemResult.error) return false
    return (itemResult.count ?? 0) > 0
  },

  // ── ReserveStock ──────────────────────────────────────────────────────────
  // Calls the reserve_artwork_stock Postgres RPC which acquires a row-level
  // lock and decrements stock atomically. Returns false when stock is
  // insufficient — never throws for that case, only for DB errors.

  async reserveStock(
    artworkId: string,
    quantity: number,
    variantOptionId?: string,
  ): Promise<boolean> {
    const result = await (supabase() as any)
      .rpc('reserve_artwork_stock', {
        p_artwork_id:        artworkId,
        p_quantity:          quantity,
        p_variant_option_id: variantOptionId ?? null,
      })

    if (result.error) {
      throw new Error(`[Supabase:artwork.reserveStock] ${result.error.message}`)
    }
    return result.data as boolean
  },

  // ── ReleaseStock ──────────────────────────────────────────────────────────
  // Mirror of reserveStock — called on order cancellation.

  async releaseStock(
    artworkId: string,
    quantity: number,
    variantOptionId?: string,
  ): Promise<void> {
    const result = await (supabase() as any)
      .rpc('release_artwork_stock', {
        p_artwork_id:        artworkId,
        p_quantity:          quantity,
        p_variant_option_id: variantOptionId ?? null,
      })

    if (result.error) {
      throw new Error(`[Supabase:artwork.releaseStock] ${result.error.message}`)
    }
  },
}