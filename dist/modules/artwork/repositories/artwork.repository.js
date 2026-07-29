"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.artworkRepository = void 0;
const uuid_1 = require("uuid");
const database_1 = require("../../../config/database");
// ── Row → Domain mapper ───────────────────────────────────────────────────────
function parseJsonField(value, fallback) {
    if (value == null)
        return fallback;
    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        }
        catch {
            return fallback;
        }
    }
    return value;
}
function toArtwork(row, isSaved) {
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
        ['assets']: parseJsonField(row['assets'], []),
        ['visibility']: row['visibility'],
        ['allow_moodboard_save']: row['allow_moodboard_save'],
        ['allow_comments']: row['allow_comments'],
        ['allow_likes']: row['allow_likes'],
        ['show_engagement_stats']: row['show_engagement_stats'],
        ['status']: row['status'],
        ['is_flagged']: row['is_flagged'],
        ...(isSaved !== undefined ? { is_saved: isSaved } : {}),
        ['moderation_status']: row['moderation_status'],
        ['reviewed_by']: row['reviewed_by'] ?? null,
        ['review_notes']: row['review_notes'] ?? null,
        ['price']: row['price'] !== null ? Number(row['price']) : null,
        ['currency']: row['currency'],
        ['max_purchase_quantity']: row['max_purchase_quantity'] ?? null,
        ['physical_details']: parseJsonField(row['physical_details'], null),
        ['has_variants']: row['has_variants'],
        ['variants']: parseJsonField(row['variants'], []),
        ['view_count']: row['view_count'],
        ['like_count']: row['like_count'],
        ['save_count']: row['save_count'],
        ['comment_count']: row['comment_count'],
        ['purchase_count']: row['purchase_count'] ?? 0,
        ['created_at']: new Date(row['created_at']),
        ['updated_at']: new Date(row['updated_at']),
        ['deleted_at']: row['deleted_at'] ? new Date(row['deleted_at']) : null,
    };
}
const CREATOR_EMBED = `
  *,
  creator:users!artworks_creator_id_fkey (
    id,
    username,
    role,
    profile:profiles (
      display_name,
      avatar_url,
      followers_count,
      following_count,
      artworks_count,
      sales_count
    )
  )
`;
const FEATURED_EMBED = `
  id, slug, title, view_count, like_count, purchase_count, created_at, assets,
  creator:users!artworks_creator_id_fkey (
    id,
    role,
    username,
    profile:profiles (
      display_name,
      avatar_url,
      bio
    )
  )
`;
function pickThumbnail(assets) {
    const list = parseJsonField(assets, []);
    if (!list.length)
        return null;
    const primary = [...list].sort((a, b) => a.ordering_index - b.ordering_index)[0];
    return primary?.thumbnail_url ?? primary?.optimized_url ?? primary?.original_url ?? null;
}
function toFeaturedArtwork(row) {
    const creatorRow = row['creator'] ?? {};
    const profile = creatorRow['profile'] ?? {};
    return {
        ['id']: row['id'],
        ['slug']: row['slug'],
        ['title']: row['title'],
        ['description']: row['description'],
        ['thumbnail_url']: pickThumbnail(row['assets']),
        ['view_count']: row['view_count'] ?? 0,
        ['like_count']: row['like_count'] ?? 0,
        ['purchase_count']: row['purchase_count'] ?? 0,
        ['created_at']: new Date(row['created_at']),
        ['creator']: {
            ['id']: creatorRow['id'],
            ['username']: creatorRow['username'] ?? null,
            ['display_name']: profile['display_name'] ?? null,
            ['avatar_url']: profile['avatar_url'] ?? null,
            ['bio']: profile['bio'] ?? null,
            ['role']: creatorRow['role'],
        },
    };
}
// ── Repository ────────────────────────────────────────────────────────────────
function emptyResult(page, limit) {
    return { data: [], total: 0, page, limit, total_pages: 0, has_next: false, has_prev: page > 1 };
}
exports.artworkRepository = {
    // ── Create ─────────────────────────────────────────────────────────────────
    async create(input, creatorId, slug) {
        const assetsWithIds = input.assets.map((a, i) => ({
            ...a,
            id: (0, uuid_1.v4)(),
            ordering_index: a.ordering_index ?? i,
        }));
        const variantsWithIds = (input.variants ?? []).map(v => ({
            ...v,
            id: (0, uuid_1.v4)(),
            options: v.options.map(o => ({ ...o, id: (0, uuid_1.v4)() })),
        }));
        const payload = {
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
            ['allow_moodboard_save']: input.allow_moodboard_save,
            ['allow_comments']: input.allow_comments,
            ['allow_likes']: input.allow_likes,
            ['show_engagement_stats']: input.show_engagement_stats,
            ['status']: input.status ?? 'DRAFT',
            ['moderation_status']: 'PENDING',
            ['is_flagged']: false,
            ['currency']: input.currency ?? 'USD',
            ['has_variants']: input.has_variants,
            ['variants']: JSON.stringify(variantsWithIds),
        };
        if (input.price !== undefined)
            payload['price'] = input.price;
        if (input.max_purchase_quantity !== undefined)
            payload['max_purchase_quantity'] = input.max_purchase_quantity;
        if (input.physical_details)
            payload['physical_details'] = JSON.stringify(input.physical_details);
        const result = await (0, database_1.supabase)()
            .from('artworks')
            .insert(payload)
            .select('*')
            .single();
        (0, database_1.assertNoError)(result, 'artwork.create');
        return toArtwork(result.data);
    },
    // ── FindById ───────────────────────────────────────────────────────────────
    async findById(id, requesterId) {
        const result = await (0, database_1.supabase)()
            .from('artworks')
            .select(CREATOR_EMBED)
            .eq('id', id)
            .is('deleted_at', null)
            .single();
        if (result.error?.code === 'PGRST116')
            return undefined;
        (0, database_1.assertNoError)(result, 'artwork.findById');
        const isSaved = requesterId ? await this.findSaveStatus(id, requesterId) : undefined;
        return toArtwork(result.data, isSaved);
    },
    // ── FindBySlug 
    async findBySlug(slug, requesterId) {
        const result = await (0, database_1.supabase)()
            .from('artworks')
            .select(CREATOR_EMBED)
            .eq('slug', slug)
            .is('deleted_at', null)
            .single();
        if (result.error?.code === 'PGRST116')
            return undefined;
        (0, database_1.assertNoError)(result, 'artwork.findBySlug');
        const isSaved = requesterId ? await this.findSaveStatus(result.data.id, requesterId) : undefined;
        return toArtwork(result.data, isSaved);
    },
    // ── Update (SECURED WITH DEEP MERGE) ───────────────────────────────────────
    async update(id, input) {
        // 1. Fetch the existing record to prevent JSONB overwriting loops
        const existing = await this.findById(id);
        if (!existing) {
            throw new Error(`[Supabase:artwork.update] Artwork not found for id ${id}`);
        }
        const payload = {
            ['updated_at']: new Date().toISOString(),
        };
        // Standard primitive fields map directly
        if (input.title !== undefined)
            payload['title'] = input.title;
        if (input.description !== undefined)
            payload['description'] = input.description;
        if (input.categories !== undefined)
            payload['categories'] = input.categories;
        if (input.keywords !== undefined)
            payload['keywords'] = input.keywords;
        if (input.collaborator_ids !== undefined)
            payload['collaborator_ids'] = input.collaborator_ids;
        if (input.tools_used !== undefined)
            payload['tools_used'] = input.tools_used;
        if (input.visibility !== undefined)
            payload['visibility'] = input.visibility;
        if (input.allow_moodboard_save !== undefined)
            payload['allow_moodboard_save'] = input.allow_moodboard_save;
        if (input.allow_comments !== undefined)
            payload['allow_comments'] = input.allow_comments;
        if (input.allow_likes !== undefined)
            payload['allow_likes'] = input.allow_likes;
        if (input.show_engagement_stats !== undefined)
            payload['show_engagement_stats'] = input.show_engagement_stats;
        if (input.price !== undefined)
            payload['price'] = input.price;
        if (input.currency !== undefined)
            payload['currency'] = input.currency;
        if (input.max_purchase_quantity !== undefined)
            payload['max_purchase_quantity'] = input.max_purchase_quantity;
        if (input.has_variants !== undefined)
            payload['has_variants'] = input.has_variants;
        // 2. Safe Array Merge for Assets
        if (input.assets !== undefined) {
            const existingAssetsMap = new Map(existing.assets.map(a => [a.id, a]));
            const mergedAssets = input.assets.map((inputAsset, i) => {
                const assetId = inputAsset.id;
                const existingAsset = assetId ? existingAssetsMap.get(assetId) : null;
                return existingAsset
                    ? { ...existingAsset, ...inputAsset, ordering_index: inputAsset.ordering_index ?? existingAsset.ordering_index }
                    : { ...inputAsset, id: assetId ?? (0, uuid_1.v4)(), ordering_index: inputAsset.ordering_index ?? i };
            });
            // Retain existing assets that were completely omitted from the update payload
            const inputAssetIds = new Set(mergedAssets.map(a => a.id));
            const omittedAssets = existing.assets.filter(a => !inputAssetIds.has(a.id));
            payload['assets'] = JSON.stringify([...mergedAssets, ...omittedAssets]);
        }
        // 3. Safe Nested Array Merge for Variants and their Options
        if (input.variants !== undefined) {
            const existingVariantsMap = new Map(existing.variants.map(v => [v.id, v]));
            const mergedVariants = input.variants.map(inputVariant => {
                const variantId = inputVariant.id;
                const existingVariant = variantId ? existingVariantsMap.get(variantId) : null;
                if (existingVariant) {
                    const existingOptionsMap = new Map(existingVariant.options.map((o) => [o.id, o]));
                    const mergedOptions = inputVariant.options.map((inputOption) => {
                        const optionId = inputOption.id;
                        const existingOption = optionId ? existingOptionsMap.get(optionId) : null;
                        return existingOption
                            ? { ...existingOption, ...inputOption }
                            : { ...inputOption, id: (0, uuid_1.v4)() };
                    });
                    const inputOptionIds = new Set(mergedOptions.map(o => o.id));
                    const omittedOptions = existingVariant.options.filter((o) => !inputOptionIds.has(o.id));
                    return {
                        ...existingVariant,
                        ...inputVariant,
                        id: variantId,
                        options: [...mergedOptions, ...omittedOptions]
                    };
                }
                else {
                    // Brand new variant
                    return {
                        ...inputVariant,
                        id: variantId ?? (0, uuid_1.v4)(),
                        options: inputVariant.options.map(o => ({ ...o, id: o.id ?? (0, uuid_1.v4)() }))
                    };
                }
            });
            // Retain existing variants that were omitted from the update payload
            const inputVariantIds = new Set(mergedVariants.map(v => v.id));
            const omittedVariants = existing.variants.filter(v => !inputVariantIds.has(v.id));
            payload['variants'] = JSON.stringify([...mergedVariants, ...omittedVariants]);
        }
        // 4. Safe Object Merge for Physical Details
        if (input.physical_details !== undefined) {
            if (input.physical_details === null) {
                payload['physical_details'] = null;
            }
            else {
                const mergedPhysicalDetails = {
                    ...(existing.physical_details || {}),
                    ...input.physical_details
                };
                payload['physical_details'] = JSON.stringify(mergedPhysicalDetails);
            }
        }
        const result = await (0, database_1.supabase)()
            .from('artworks')
            .update(payload)
            .eq('id', id)
            .is('deleted_at', null)
            .select('*')
            .single();
        (0, database_1.assertNoError)(result, 'artwork.update');
        return toArtwork(result.data);
    },
    // ── UpdateStatus ───────────────────────────────────────────────────────────
    async updateStatus(id, status, moderationStatus) {
        const payload = {
            ['status']: status,
            ['updated_at']: new Date().toISOString(),
        };
        if (moderationStatus)
            payload['moderation_status'] = moderationStatus;
        const result = await (0, database_1.supabase)()
            .from('artworks')
            .update(payload)
            .eq('id', id)
            .is('deleted_at', null)
            .select('*')
            .single();
        (0, database_1.assertNoError)(result, 'artwork.updateStatus');
        return toArtwork(result.data);
    },
    // ── SoftDelete ─────────────────────────────────────────────────────────────
    async softDelete(id) {
        const result = await (0, database_1.supabase)()
            .from('artworks')
            .update({
            ['deleted_at']: new Date().toISOString(),
            ['status']: 'ARCHIVED',
            ['updated_at']: new Date().toISOString(),
        })
            .eq('id', id);
        if (result.error) {
            throw new Error(`[Supabase:artwork.softDelete] ${result.error.message}`);
        }
    },
    // ── GenerateSlug ───────────────────────────────────────────────────────────
    async generateSlug(title, creatorId) {
        const result = await (0, database_1.supabase)()
            .rpc('generate_artwork_slug', {
            p_title: title,
            p_creator_id: creatorId,
        });
        if (result.error) {
            throw new Error(`[Supabase:artwork.generateSlug] ${result.error.message}`);
        }
        return result.data;
    },
    // ── IncrementViewCount ─────────────────────────────────────────────────────
    async incrementViewCount(id) {
        const result = await (0, database_1.supabase)()
            .rpc('increment_artwork_view_count', { p_artwork_id: id });
        if (result.error) {
            throw new Error(`[Supabase:artwork.incrementViewCount] ${result.error.message}`);
        }
    },
    // ── ToggleLike ─────────────────────────────────────────────────────────────
    async toggleLike(artworkId, userId) {
        const result = await (0, database_1.supabase)()
            .rpc('toggle_artwork_like', { p_artwork_id: artworkId, p_user_id: userId });
        if (result.error) {
            throw new Error(`[Supabase:artwork.toggleLike] ${result.error.message}`);
        }
        const row = (result.data ?? [])[0] ?? { liked: false, like_count: 0 };
        return { liked: Boolean(row['liked']), like_count: Number(row['like_count']) };
    },
    async hasLiked(artworkId, userId) {
        const result = await (0, database_1.supabase)()
            .from('artwork_likes')
            .select('id')
            .eq('artwork_id', artworkId)
            .eq('user_id', userId)
            .maybeSingle();
        if (result.error) {
            throw new Error(`[Supabase:artwork.hasLiked] ${result.error.message}`);
        }
        return Boolean(result.data);
    },
    // ── List ───────────────────────────────────────────────────────────────────
    async list(filters) {
        const page = Math.max(1, filters.page ?? 1);
        const limit = Math.min(50, Math.max(1, filters.limit ?? 20));
        const from = (page - 1) * limit;
        const to = from + limit - 1;
        // Resolve location/size filters into concrete id lists first — both are
        // fundamentally "which artworks/creators match" lookups that can't be
        // expressed as a simple column comparison (location lives one hop away
        // on profiles; size lives inside a JSONB array), so they're resolved
        // up front and then applied the same way creator_ids already is.
        let resolvedCreatorIds = filters.creator_ids;
        if (filters.location?.trim()) {
            const locationCreatorIds = await this.getCreatorIdsByLocation(filters.location.trim());
            if (locationCreatorIds.length === 0) {
                return emptyResult(page, limit);
            }
            resolvedCreatorIds = resolvedCreatorIds?.length
                ? resolvedCreatorIds.filter((id) => locationCreatorIds.includes(id))
                : locationCreatorIds;
        }
        let sizeArtworkIds;
        if (filters.size_label?.trim()) {
            sizeArtworkIds = await this.getArtworkIdsBySize(filters.size_label.trim());
            if (sizeArtworkIds.length === 0) {
                return emptyResult(page, limit);
            }
        }
        let query = (0, database_1.supabase)()
            .from('artworks')
            .select(CREATOR_EMBED, { count: 'exact' })
            .is('deleted_at', null);
        if (filters.creator_id)
            query = query.eq('creator_id', filters.creator_id);
        if (resolvedCreatorIds?.length)
            query = query.in('creator_id', resolvedCreatorIds);
        if (sizeArtworkIds?.length)
            query = query.in('id', sizeArtworkIds);
        if (filters.listing_type)
            query = query.eq('listing_type', filters.listing_type);
        if (filters.artwork_format)
            query = query.eq('artwork_format', filters.artwork_format);
        if (filters.status)
            query = query.eq('status', filters.status);
        if (filters.visibility)
            query = query.eq('visibility', filters.visibility);
        if (filters.min_price !== undefined)
            query = query.gte('price', filters.min_price);
        if (filters.max_price !== undefined)
            query = query.lte('price', filters.max_price);
        if (filters.categories?.length) {
            // .overlaps (not .contains) — a multi-select category filter means
            // "has ANY of these categories", not "has ALL of these categories".
            // .contains would require every selected category to be present on
            // the same artwork simultaneously, which is far too restrictive for
            // what a category filter chip UI actually means.
            query = query.overlaps('categories', filters.categories);
        }
        if (filters.search?.trim()) {
            query = query.textSearch('search_vector', filters.search.trim(), {
                type: 'plain',
                config: 'english',
            });
        }
        const sortColumn = filters.sort_by ?? 'created_at';
        const sortOrder = filters.sort_order ?? 'desc';
        query = query.order(sortColumn, { ascending: sortOrder === 'asc' });
        query = query.range(from, to);
        const result = await query;
        if (result.error) {
            throw new Error(`[Supabase:artwork.list] ${result.error.message}`);
        }
        const total = result.count ?? 0;
        const total_pages = Math.ceil(total / limit);
        return {
            data: (result.data ?? []).map(toArtwork),
            total,
            page,
            limit,
            total_pages,
            has_next: page < total_pages,
            has_prev: page > 1,
        };
    },
    // ── Category affinity for "For You" ──────────────────────────────────────────
    // No recommendation engine exists — this is a deliberately simple v1
    // heuristic: look at categories on artworks the user has liked, commented
    // on, or rated 5 stars after a purchase, rank by frequency, return the top
    // N. Three lightweight queries + in-memory aggregation, not a single
    // mega-join — easier to reason about and each piece stays independently
    // cacheable/fast on its own indexes.
    async getEngagedCategories(userId, limit = 5) {
        const [likedRes, commentedRes, ratedRes] = await Promise.all([
            (0, database_1.supabase)().from('artwork_likes').select('artwork_id').eq('user_id', userId),
            (0, database_1.supabase)().from('comments').select('artwork_id').eq('user_id', userId).is('deleted_at', null),
            (0, database_1.supabase)().from('order_reviews').select('artwork_id').eq('buyer_id', userId).eq('rating', 5),
        ]);
        if (likedRes.error)
            throw new Error(`[Supabase:artwork.getEngagedCategories:likes] ${likedRes.error.message}`);
        if (commentedRes.error)
            throw new Error(`[Supabase:artwork.getEngagedCategories:comments] ${commentedRes.error.message}`);
        if (ratedRes.error)
            throw new Error(`[Supabase:artwork.getEngagedCategories:reviews] ${ratedRes.error.message}`);
        const artworkIds = Array.from(new Set([
            ...(likedRes.data ?? []).map((r) => r['artwork_id']),
            ...(commentedRes.data ?? []).map((r) => r['artwork_id']),
            ...(ratedRes.data ?? []).map((r) => r['artwork_id']),
        ]));
        if (artworkIds.length === 0)
            return [];
        const categoriesRes = await (0, database_1.supabase)()
            .from('artworks')
            .select('categories')
            .in('id', artworkIds);
        if (categoriesRes.error) {
            throw new Error(`[Supabase:artwork.getEngagedCategories:categories] ${categoriesRes.error.message}`);
        }
        const frequency = new Map();
        for (const row of categoriesRes.data ?? []) {
            for (const category of row['categories'] ?? []) {
                frequency.set(category, (frequency.get(category) ?? 0) + 1);
            }
        }
        return Array.from(frequency.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([category]) => category);
    },
    // ── Recently-joined artists for "Newbies" ────────────────────────────────────
    async getRecentArtistIds(sinceDays = 30, limit = 200) {
        const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
        const result = await (0, database_1.supabase)()
            .from('users')
            .select('id')
            .eq('role', 'ARTIST')
            .gte('created_at', since)
            .limit(limit);
        if (result.error) {
            throw new Error(`[Supabase:artwork.getRecentArtistIds] ${result.error.message}`);
        }
        return (result.data ?? []).map((r) => r['id']);
    },
    // ── Location filter ("profiles.location" substring match) ───────────────────
    // profiles.location is free text (not an ISO code), so this is a substring
    // match rather than exact — "Lagos, Nigeria" should match a "Nigeria"
    // filter. Two-step (resolve creator ids, then .in() on the main query),
    // same pattern as getRecentArtistIds/getEngagedCategories above.
    async getCreatorIdsByLocation(locationQuery) {
        const result = await (0, database_1.supabase)()
            .from('profiles')
            .select('user_id')
            .ilike('location', `%${locationQuery}%`);
        if (result.error) {
            throw new Error(`[Supabase:artwork.getCreatorIdsByLocation] ${result.error.message}`);
        }
        return (result.data ?? []).map((r) => r['user_id']);
    },
    // ── Size variant ("Medium") filter ───────────────────────────────────────────
    // variants is a JSONB array with no relational table backing it, so both
    // of these go through Postgres functions (see
    // 20241101000000_top_picks_and_size_filter.sql) rather than trying to
    // express JSONB-array matching through the JS query builder.
    async getDistinctSizeLabels() {
        const result = await (0, database_1.supabase)().rpc('get_distinct_size_labels');
        if (result.error) {
            throw new Error(`[Supabase:artwork.getDistinctSizeLabels] ${result.error.message}`);
        }
        return (result.data ?? []).map((r) => ({
            label: r['label'],
            artwork_count: Number(r['artwork_count']),
        }));
    },
    async getArtworkIdsBySize(sizeLabel) {
        const result = await (0, database_1.supabase)().rpc('get_artwork_ids_by_size', { p_size_label: sizeLabel });
        if (result.error) {
            throw new Error(`[Supabase:artwork.getArtworkIdsBySize] ${result.error.message}`);
        }
        return (result.data ?? []).map((r) => r['id']);
    },
    async findManyByIdsOrdered(ids) {
        if (ids.length === 0)
            return [];
        const result = await (0, database_1.supabase)()
            .from('artworks')
            .select(CREATOR_EMBED)
            .in('id', ids);
        if (result.error) {
            throw new Error(`[Supabase:artwork.findManyByIdsOrdered] ${result.error.message}`);
        }
        const byId = new Map((result.data ?? []).map((row) => [row.id, row]));
        return ids.map((id) => byId.get(id)).filter(Boolean).map((row) => toArtwork(row));
    },
    async getDistinctLocations() {
        const result = await (0, database_1.supabase)().rpc('get_distinct_artist_locations');
        if (result.error) {
            throw new Error(`[Supabase:artwork.getDistinctLocations] ${result.error.message}`);
        }
        return (result.data ?? []).map((r) => ({
            label: r['label'],
            artwork_count: Number(r['artwork_count']),
        }));
    },
    // ── Top Picks ─────────────────────────────────────────────────────────────────
    // Real ranking algorithm (decayed hot-score, one per creator for
    // diversity) — see get_top_picks() in the same migration. Not manual
    // curation; there's no is_featured flag on the canonical artworks table.
    async getTopPicks(limit = 8, listingType) {
        const result = await (0, database_1.supabase)().rpc('get_top_picks', {
            p_limit: limit,
            p_listing_type: listingType ?? null,
        });
        if (result.error) {
            throw new Error(`[Supabase:artwork.getTopPicks] ${result.error.message}`);
        }
        // The RPC returns SETOF artworks (bare rows, no creator embed — Postgres
        // functions can't express a PostgREST-style embed). Re-fetch through the
        // normal embedded query so callers get creator/profile data consistently
        // with every other artwork response.
        const ids = (result.data ?? []).map((r) => r['id']);
        if (ids.length === 0)
            return [];
        const embedResult = await (0, database_1.supabase)()
            .from('artworks')
            .select(CREATOR_EMBED)
            .in('id', ids);
        if (embedResult.error) {
            throw new Error(`[Supabase:artwork.getTopPicks:embed] ${embedResult.error.message}`);
        }
        // Preserve the RPC's ranking order — the embed re-fetch above doesn't
        // guarantee row order matches the .in() list.
        const byId = new Map((embedResult.data ?? []).map((row) => [row.id, row]));
        return ids.map((id) => toArtwork(byId.get(id))).filter(Boolean);
    },
    // ── Featured artworks (homepage hero) ─────────────────────────────────────────
    // All-time proven performers: real purchases, or a meaningful like count —
    // guards against a fresh artwork with like_count=0 looking "well performing"
    // on an otherwise-empty site.
    async findTopPerformers(limit) {
        const result = await (0, database_1.supabase)()
            .from('artworks')
            .select(FEATURED_EMBED)
            .eq('status', 'PUBLISHED')
            .eq('visibility', 'PUBLIC')
            .is('deleted_at', null)
            .or('purchase_count.gt.0,like_count.gte.5')
            .order('purchase_count', { ascending: false })
            .order('like_count', { ascending: false })
            .limit(limit);
        if (result.error) {
            throw new Error(`[Supabase:artwork.findTopPerformers] ${result.error.message}`);
        }
        return (result.data ?? []).map(toFeaturedArtwork);
    },
    // Recently-published artworks with at least some engagement — the raw
    // candidate pool the service scores/ranks by view-weighted velocity.
    async findRecentCandidates(sinceIso, limit, listingType) {
        let query = (0, database_1.supabase)()
            .from('artworks')
            .select(FEATURED_EMBED)
            .eq('status', 'PUBLISHED')
            .eq('visibility', 'PUBLIC')
            .is('deleted_at', null)
            .gte('created_at', sinceIso)
            .gt('view_count', 0)
            .order('created_at', { ascending: false })
            .limit(limit);
        if (listingType)
            query = query.eq('listing_type', listingType);
        const result = await query;
        if (result.error) {
            throw new Error(`[Supabase:artwork.findRecentCandidates] ${result.error.message}`);
        }
        return (result.data ?? []).map(toFeaturedArtwork);
    },
    // Last-resort backfill when the site doesn't yet have enough qualifying
    // proven/trending artworks to fill every hero slot with real data.
    async findFallback(excludeIds, limit) {
        let query = (0, database_1.supabase)()
            .from('artworks')
            .select(FEATURED_EMBED)
            .eq('status', 'PUBLISHED')
            .eq('visibility', 'PUBLIC')
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(limit + excludeIds.length);
        if (excludeIds.length)
            query = query.not('id', 'in', `(${excludeIds.join(',')})`);
        const result = await query;
        if (result.error) {
            throw new Error(`[Supabase:artwork.findFallback] ${result.error.message}`);
        }
        return (result.data ?? []).map(toFeaturedArtwork).slice(0, limit);
    },
    async flag(id, reviewerId, notes, moderationStatus) {
        const result = await (0, database_1.supabase)()
            .from('artworks')
            .update({
            ['is_flagged']: true,
            ['moderation_status']: moderationStatus,
            ['reviewed_by']: reviewerId,
            ['review_notes']: notes,
            ['updated_at']: new Date().toISOString(),
        })
            .eq('id', id)
            .is('deleted_at', null)
            .select('*')
            .single();
        (0, database_1.assertNoError)(result, 'artwork.flag');
        return toArtwork(result.data);
    },
    // ── FindPurchasableById ────────────────────────────────────────────────────
    // Used by the cart and checkout services. Returns undefined when the artwork
    // exists but is not currently purchasable, so callers get a clean signal
    // without having to re-implement the purchasability predicate.
    async findPurchasableById(id) {
        const result = await (0, database_1.supabase)()
            .from('artworks')
            .select('*')
            .eq('id', id)
            .eq('listing_type', 'MARKETPLACE')
            .eq('status', 'PUBLISHED')
            .eq('moderation_status', 'APPROVED')
            .eq('visibility', 'PUBLIC')
            .eq('is_flagged', false)
            .is('deleted_at', null)
            .single();
        if (result.error?.code === 'PGRST116')
            return undefined;
        (0, database_1.assertNoError)(result, 'artwork.findPurchasableById');
        return toArtwork(result.data);
    },
    // ── HasActiveOrders ────────────────────────────────────────────────────────
    // Returns true when at least one non-terminal order_item row exists for the
    // artwork joined to an order in an active status.
    //
    // Uses a two-step approach: fetch active order IDs first, then check whether
    // any order_item for this artwork belongs to one of those orders. Supabase's
    // JS client cannot express cross-table WHERE filters in a single count query.
    async hasActiveOrders(artworkId) {
        const activeStatuses = [
            'PENDING_PAYMENT',
            'PAYMENT_CONFIRMED',
            'PROCESSING',
            'SHIPPED',
        ];
        // Step 1 — collect IDs of orders that are currently in an active state
        const orderResult = await (0, database_1.supabase)()
            .from('orders')
            .select('id')
            .in('status', activeStatuses);
        if (orderResult.error || !orderResult.data?.length)
            return false;
        const activeOrderIds = orderResult.data.map(r => r.id);
        // Step 2 — check whether this artwork appears in any of those orders
        const itemResult = await (0, database_1.supabase)()
            .from('order_items')
            .select('id', { count: 'exact', head: true })
            .eq('artwork_id', artworkId)
            .in('order_id', activeOrderIds);
        if (itemResult.error)
            return false;
        return (itemResult.count ?? 0) > 0;
    },
    // ── ReserveStock ──────────────────────────────────────────────────────────
    // Calls the reserve_artwork_stock Postgres RPC which acquires a row-level
    // lock and decrements stock atomically. Returns false when stock is
    // insufficient — never throws for that case, only for DB errors.
    async reserveStock(artworkId, quantity, variantOptionId) {
        const result = await (0, database_1.supabase)()
            .rpc('reserve_artwork_stock', {
            p_artwork_id: artworkId,
            p_quantity: quantity,
            p_variant_option_id: variantOptionId ?? null,
        });
        if (result.error) {
            throw new Error(`[Supabase:artwork.reserveStock] ${result.error.message}`);
        }
        return result.data;
    },
    // ── ReleaseStock ──────────────────────────────────────────────────────────
    // Mirror of reserveStock — called on order cancellation.
    async releaseStock(artworkId, quantity, variantOptionId) {
        const result = await (0, database_1.supabase)()
            .rpc('release_artwork_stock', {
            p_artwork_id: artworkId,
            p_quantity: quantity,
            p_variant_option_id: variantOptionId ?? null,
        });
        if (result.error) {
            throw new Error(`[Supabase:artwork.releaseStock] ${result.error.message}`);
        }
    },
    async findSaveStatus(artworkId, userId) {
        const result = await (0, database_1.supabase)()
            .from('saves')
            .select('id')
            .eq('artwork_id', artworkId)
            .eq('user_id', userId)
            .maybeSingle();
        if (result.error) {
            throw new Error(`[Supabase:artwork.findSaveStatus] ${result.error.message}`);
        }
        return Boolean(result.data);
    },
    async toggleSave(artworkId, userId) {
        const result = await (0, database_1.supabase)()
            .rpc('toggle_artwork_save', { p_artwork_id: artworkId, p_user_id: userId });
        if (result.error) {
            throw new Error(`[Supabase:artwork.toggleSave] ${result.error.message}`);
        }
        const row = (result.data ?? [])[0] ?? { saved: false, save_count: 0 };
        return { saved: Boolean(row['saved']), save_count: Number(row['save_count']) };
    },
    async createReport(artworkId, reporterId, reason, notes) {
        const result = await (0, database_1.supabase)()
            .from('artwork_reports')
            .upsert({
            ['artwork_id']: artworkId,
            ['reporter_id']: reporterId,
            ['reason']: reason,
            ['notes']: notes ?? null,
        }, { onConflict: 'artwork_id,reporter_id', ignoreDuplicates: true });
        if (result.error) {
            throw new Error(`[Supabase:artwork.createReport] ${result.error.message}`);
        }
    },
};
//# sourceMappingURL=artwork.repository.js.map