import type { Request, Response, NextFunction } from 'express'
import { body, param, query, validationResult } from 'express-validator'
import * as artworkService from '../services/artwork.service'
import { extractRequestContext } from '@/middleware/error.middleware'
import { ValidationError, ForbiddenError, UnauthorizedError } from '@/common/errors'
import type {
  CreateArtworkInput,
  UpdateArtworkInput,
  ArtworkFilters,
  ListingType,
  ArtworkFormat,
  ArtworkVisibility,
  ArtworkMediaType,
} from '@/common/types/artwork.types'
import type { UserRole } from '@/common/types'

// ── Validation helper (mirrors auth.controller.ts pattern) ────────────────────

function assertValid(req: Request): void {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    const fields = Object.fromEntries(
      errors.array().map((e) => ['path' in e ? e.path : 'field', e.msg])
    )
    throw new ValidationError('Validation failed', fields)
  }
}

// ── Reusable sub-chains ───────────────────────────────────────────────────────
const isProduction = process.env['NODE_ENV'] === 'production';

const assetValidation = [
  body('assets').isArray({ min: 0 }).withMessage('assets must be an array'),
  body('assets.*.original_url')
    .isURL({ require_tld: isProduction, require_protocol: true, protocols: isProduction ? ['https'] : ['http', 'https'] })
    .withMessage('Each asset must have a valid HTTPS original_url'),
  body('assets.*.media_type')
    .isIn(['IMAGE', 'VIDEO', 'THREE_D', 'EXTERNAL_LINK'])
    .withMessage('Invalid asset media_type'),
  body('assets.*.mime_type').isString().notEmpty().withMessage('mime_type is required'),
  body('assets.*.file_size_bytes').isInt({ min: 1 }).withMessage('file_size_bytes must be a positive integer'),
  body('assets.*.ordering_index').optional().isInt({ min: 0 }),
  body('assets.*.width').optional().isInt({ min: 1 }),
  body('assets.*.height').optional().isInt({ min: 1 }),
  body('assets.*.duration_secs').optional().isFloat({ min: 0 }),
]

const variantValidation = [
  body('variants').optional().isArray(),
  body('variants.*.type')
    .optional()
    .isIn(['SIZE', 'COLOR', 'MATERIAL', 'FRAMING', 'EDITION'])
    .withMessage('Invalid variant type'),
  body('variants.*.name').optional().isString().notEmpty().trim(),
  body('variants.*.options').optional().isArray({ min: 1 }),
  body('variants.*.options.*.label').optional().isString().notEmpty().trim(),
  body('variants.*.options.*.price_modifier').optional().isFloat(),
  body('variants.*.options.*.stock').optional().isInt({ min: 0 }),
  body('variants.*.options.*.max_order').optional().isInt({ min: 1 }),
  body('variants.*.options.*.is_available').optional().isBoolean(),
]

const physicalValidation = [
  body('physical_details.length').optional().isFloat({ min: 0.01 }),
  body('physical_details.width').optional().isFloat({ min: 0.01 }),
  body('physical_details.height').optional().isFloat({ min: 0.01 }),
  body('physical_details.unit').optional().isIn(['cm', 'in']),
  body('physical_details.available_quantity').optional().isInt({ min: 0 }),
  body('physical_details.max_order').optional().isInt({ min: 1 }),
  body('physical_details.shipping_regions').optional().isArray(),
  body('physical_details.ships_worldwide').optional().isBoolean(),
]

// ── Exported validation chains ─────────────────────────────────────────────────

export const createArtworkValidation = [
  body('listing_type')
    .isIn(['MARKETPLACE', 'PORTFOLIO'])
    .withMessage('listing type must be MARKETPLACE or PORTFOLIO'),
  body('artwork_format')
    .isIn(['DIGITAL', 'PHYSICAL'])
    .withMessage('artwork format must be DIGITAL or PHYSICAL'),
  body('title')
    .isString().trim().isLength({ min: 1, max: 300 })
    .withMessage('title must be 1–300 characters'),
  body('description')
    .isString().trim().isLength({ min: 1, max: 10000 })
    .withMessage('description must be 1–10000 characters'),
  body('categories')
    .optional().isArray({ max: 20 })
    .withMessage('categories must be an array of up to 20 items'),
  body('categories.*')
    .optional().isString().trim().isLength({ min: 1, max: 80 }),
  body('keywords')
    .optional().isArray({ max: 30 })
    .withMessage('keywords must be an array of up to 30 items'),
  body('keywords.*')
    .optional().isString().trim().isLength({ min: 1, max: 80 }),
  body('collaborator_ids')
    .optional().isArray({ max: 10 })
    .withMessage('at most 10 collaborators allowed'),
  body('collaborator_ids.*')
    .optional().isUUID().withMessage('Each collaborator_id must be a valid UUID'),
  body('tools_used')
    .optional().isArray({ max: 20 }),
  body('tools_used.*')
    .optional().isString().trim().isLength({ min: 1, max: 100 }),
  body('visibility')
    .optional().isIn(['PUBLIC', 'PRIVATE', 'UNLISTED'])
    .withMessage('visibility must be PUBLIC, PRIVATE, or UNLISTED'),
  body('allow_moodboard_save').optional().isBoolean(),
  body('allow_comments').optional().isBoolean(),
  body('allow_likes').optional().isBoolean(),
  body('show_engagement_stats').optional().isBoolean(),
  body('price')
    .optional().isFloat({ min: 0 })
    .withMessage('price must be a non-negative number'),
  body('currency')
    .optional().isString().trim().isLength({ min: 3, max: 10 }),
  body('max_purchase_quantity')
    .optional().isInt({ min: 1 })
    .withMessage('max_purchase_quantity must be a positive integer'),
  body('has_variants')
    .optional().isBoolean(),
  ...assetValidation,
  ...variantValidation,
  ...physicalValidation,
]

export const updateArtworkValidation = [
  param('id').isUUID().withMessage('Invalid artwork id'),
  body('title')
    .optional().isString().trim().isLength({ min: 1, max: 300 }),
  body('description')
    .optional().isString().trim().isLength({ min: 1, max: 10000 }),
  body('categories')
    .optional().isArray({ max: 20 }),
  body('categories.*')
    .optional().isString().trim().isLength({ min: 1, max: 80 }),
  body('keywords')
    .optional().isArray({ max: 30 }),
  body('keywords.*')
    .optional().isString().trim().isLength({ min: 1, max: 80 }),
  body('collaborator_ids')
    .optional().isArray({ max: 10 }),
  body('collaborator_ids.*')
    .optional().isUUID(),
  body('tools_used')
    .optional().isArray({ max: 20 }),
  body('visibility')
    .optional().isIn(['PUBLIC', 'PRIVATE', 'UNLISTED']),
  body('allow_moodboard_save').optional().isBoolean(),
  body('allow_comments').optional().isBoolean(),
  body('allow_likes').optional().isBoolean(),
  body('show_engagement_stats').optional().isBoolean(),
  body('price')
    .optional().isFloat({ min: 0 }),
  body('currency')
    .optional().isString().trim().isLength({ min: 3, max: 10 }),
  body('max_purchase_quantity')
    .optional().isInt({ min: 1 }),
  body('has_variants').optional().isBoolean(),
  ...assetValidation,
  ...variantValidation,
  ...physicalValidation,
]

export const flagArtworkValidation = [
  param('id').isUUID().withMessage('Invalid artwork id'),
  body('notes')
    .isString().trim().isLength({ min: 1, max: 2000 })
    .withMessage('Moderation notes are required'),
  body('moderation_status')
    .isIn(['APPROVED', 'REJECTED', 'FLAGGED'])
    .withMessage('moderation_status must be APPROVED, REJECTED, or FLAGGED'),
]

export const listArtworksValidation = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
  query('sort_by')
    .optional()
    .isIn(['created_at', 'like_count', 'view_count', 'price']),
  query('sort_order').optional().isIn(['asc', 'desc']),
  query('listing_type').optional().isIn(['MARKETPLACE', 'PORTFOLIO']),
  query('artwork_format').optional().isIn(['DIGITAL', 'PHYSICAL']),
  query('status').optional().isIn(['DRAFT', 'PUBLISHED', 'ARCHIVED', 'UNDER_REVIEW']),
  query('visibility').optional().isIn(['PUBLIC', 'PRIVATE', 'UNLISTED']),
  query('min_price').optional().isFloat({ min: 0 }),
  query('max_price').optional().isFloat({ min: 0 }),
  query('search').optional().isString().trim().isLength({ max: 200 }),
  query('categories').optional(),
  query('creator_id').optional().isUUID(),
  query('location').optional().isString().trim().isLength({ max: 100 }),
  query('size_label').optional().isString().trim().isLength({ max: 50 }),
]

// ── Handlers ──────────────────────────────────────────────────────────────────

export async function handleCreateArtwork(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    assertValid(req)
    if (!req.auth) throw new UnauthorizedError()

    const body = req.body as Record<string, any>

    const input: CreateArtworkInput = {
      listing_type: body['listing_type'] as ListingType,
      artwork_format: body['artwork_format'] as ArtworkFormat,
      title: String(body['title']).trim(),
      description: String(body['description']).trim(),
      categories: (body['categories'] as string[] | undefined) ?? [],
      keywords: (body['keywords']   as string[] | undefined) ?? [],
      collaborator_ids: (body['collaborator_ids'] as string[] | undefined) ?? [],
      tools_used: (body['tools_used'] as string[] | undefined) ?? [],
      assets: (body['assets'] as any[] | undefined) ?? [],
      visibility: (body['visibility'] as ArtworkVisibility | undefined) ?? 'PUBLIC',
      allow_moodboard_save: body['allow_moodboard_save']  ?? true,
      allow_comments: body['allow_comments'] ?? true,
      allow_likes: body['allow_likes'] ?? true,
      show_engagement_stats: body['show_engagement_stats'] ?? true,
      has_variants: body['has_variants'] ?? false,
      status: String(body['status']),
      
      ...(body['price'] !== undefined ? { price: Number(body['price']) } : {}),
      ...(body['currency'] !== undefined ? { currency: String(body['currency']) } : {}),
      ...(body['max_purchase_quantity'] !== undefined ? { max_purchase_quantity: Number(body['max_purchase_quantity']) } : {}),
      ...(body['physical_details'] !== undefined ? { physical_details: body['physical_details'] } : {}),
      ...(body['variants'] !== undefined ? { variants: body['variants'] } : {}),
    }

    const artwork = await artworkService.createArtwork(input, req.auth.sub, req.auth.role as UserRole)

    res.status(201).json({ success: true, data: artwork })
  } catch (err) {
    next(err)
  }
}

export async function handleGetArtwork(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params as { id: string }
    const artwork = await artworkService.getArtworkById(id, req.auth?.sub)

    const { ctx } = { ctx: extractRequestContext(req) }
    const identity = req.auth?.sub ?? ctx.ipAddress ?? 'anonymous'
    void artworkService.trackView(id, identity).catch((err) => {
      console.error(`[Analytics Error] Failed to track view for artwork ${id}:`, err)
    })

    res.json({ success: true, data: artwork })
  } catch (err) {
    next(err)
  }
}

export async function handleToggleLike(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.auth) throw new UnauthorizedError()
    const { id } = req.params as { id: string }
    const result = await artworkService.toggleLike(id, req.auth.sub)
    res.json({ success: true, data: result })
  } catch (err) {
    next(err)
  }
}

export async function handleGetArtworkBySlug(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { slug } = req.params as { slug: string }
    const artwork = await artworkService.getArtworkBySlug(slug, req.auth?.sub)

    const { ctx } = { ctx: extractRequestContext(req) }
    const identity = req.auth?.sub ?? ctx.ipAddress ?? 'anonymous'
    void artworkService.trackView(artwork.id, identity).catch((err) => {
      console.error(`[Analytics Error] Failed to track view for artwork ${artwork.id}:`, err)
    })

    res.json({ success: true, data: artwork })
  } catch (err) {
    next(err)
  }
}

export const getFeedValidation = [
  query('mode').isIn(['for_you', 'following', 'new', 'trending', 'newbies']),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
  query('categories').optional(),
  query('location').optional().isString().trim().isLength({ max: 100 }),
  query('size_label').optional().isString().trim().isLength({ max: 50 }),
]

export async function handleGetFeed(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    assertValid(req)

    const q = req.query as Record<string, any>
    const mode = q['mode'] as 'for_you' | 'following' | 'new' | 'trending' | 'newbies'

    const filters = {
      ...(q['page'] ? { page: Number(q['page']) } : {}),
      ...(q['limit'] ? { limit: Number(q['limit']) } : {}),
      ...(q['categories']
        ? { categories: Array.isArray(q['categories']) ? q['categories'] : [q['categories']] }
        : {}),
      ...(q['location'] ? { location: q['location'] as string } : {}),
      ...(q['size_label'] ? { size_label: q['size_label'] as string } : {}),
    } as ArtworkFilters

    const result = await artworkService.getFeed(mode, filters, req.auth?.sub)
    res.json({ success: true, ...result })
  } catch (err) {
    next(err)
  }
}

// Public, unauthenticated — see artworkService.getFeaturedArtworks for the
// selection algorithm.

export const featuredArtworksValidation = [
  query('limit').optional().isInt({ min: 1, max: 10 }).withMessage('limit must be 1–10'),
]

export async function handleGetFeaturedArtworks(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    assertValid(req)
    const limit = req.query['limit'] ? Number(req.query['limit']) : 5
    const data = await artworkService.getFeaturedArtworks(limit)
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

export const getTopPicksValidation = [
  query('limit').optional().isInt({ min: 1, max: 20 }).toInt(),
  query('period').optional().isIn(['all', 'week']),
  query('listingType').optional().isIn(['MARKETPLACE', 'PORTFOLIO']),
]

export async function handleGetTopPicks(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    assertValid(req)
    const limit = (req.query['limit'] as number | undefined) ?? 8
    const period = (req.query['period'] as 'all' | 'week' | undefined) ?? 'all'
    const listingType = req.query['listingType'] as 'MARKETPLACE' | 'PORTFOLIO' | undefined
    const data = await artworkService.getTopPicks(limit, period, listingType)
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

export async function handleGetLocations(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await artworkService.getLocations()
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

export async function handleGetSizeLabels(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const data = await artworkService.getSizeLabels()
    res.json({ success: true, data })
  } catch (err) {
    next(err)
  }
}

export async function handleListArtworks(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    assertValid(req)

    const q = req.query as Record<string, any>

    // Build the clean filters payload, then safely assert as ArtworkFilters
    const filters = {
      ...(q['page'] ? { page: Number(q['page']) } : {}),
      ...(q['limit'] ? { limit: Number(q['limit']) } : {}),
      ...(q['sort_by'] ? { sort_by: q['sort_by'] } : {}),
      ...(q['sort_order'] ? { sort_order: q['sort_order'] } : {}),
      ...(q['listing_type'] ? { listing_type: q['listing_type'] } : {}),
      ...(q['artwork_format'] ? { artwork_format: q['artwork_format'] } : {}),
      ...(q['status'] ? { status: q['status'] } : {}),
      ...(q['visibility'] ? { visibility: q['visibility'] } : {}),
      ...(q['creator_id'] ? { creator_id: q['creator_id'] } : {}),
      ...(q['search'] ? { search: q['search'] as string } : {}),
      ...(q['min_price'] !== undefined && q['min_price'] !== '' ? { min_price: Number(q['min_price']) } : {}),
      ...(q['max_price'] !== undefined && q['max_price'] !== '' ? { max_price: Number(q['max_price']) } : {}),
      ...(q['categories']
        ? {
            categories: Array.isArray(q['categories'])
              ? q['categories']
              : [q['categories']],
          }
        : {}),
      ...(q['location'] ? { location: q['location'] as string } : {}),
      ...(q['size_label'] ? { size_label: q['size_label'] as string } : {}),
    } as ArtworkFilters

    const result = await artworkService.listArtworks(
      filters,
      req.auth?.sub,
      req.auth?.role as UserRole | undefined,
    )

    res.json({ success: true, ...result })
  } catch (err) {
    next(err)
  }
}

export async function handleUpdateArtwork(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    assertValid(req)
    if (!req.auth) throw new UnauthorizedError()

    const { id } = req.params as { id: string }
    const body = req.body as Record<string, any>

    const input: UpdateArtworkInput = {}

    if (body['title'] !== undefined) input.title = String(body['title']).trim()
    if (body['description'] !== undefined) input.description = String(body['description']).trim()
    if (body['categories']  !== undefined) input.categories = body['categories']
    if (body['keywords'] !== undefined) input.keywords = body['keywords']
    if (body['collaborator_ids'] !== undefined) input.collaborator_ids      = body['collaborator_ids']
    if (body['tools_used'] !== undefined) input.tools_used  = body['tools_used']
    if (body['assets'] !== undefined) input.assets = body['assets']
    if (body['visibility'] !== undefined) input.visibility  = body['visibility']
    if (body['allow_moodboard_save'] !== undefined) input.allow_moodboard_save  = body['allow_moodboard_save']
    if (body['allow_comments'] !== undefined) input.allow_comments = body['allow_comments']
    if (body['allow_likes'] !== undefined) input.allow_likes = body['allow_likes']
    if (body['show_engagement_stats'] !== undefined) input.show_engagement_stats = body['show_engagement_stats']
    if (body['price'] !== undefined) input.price = Number(body['price'])
    if (body['currency'] !== undefined) input.currency = body['currency']
    if (body['max_purchase_quantity'] !== undefined) input.max_purchase_quantity = Number(body['max_purchase_quantity'])
    if (body['physical_details'] !== undefined) input.physical_details = body['physical_details']
    if (body['has_variants'] !== undefined) input.has_variants = body['has_variants']
    if (body['variants'] !== undefined) input.variants = body['variants']

    const artwork = await artworkService.updateArtwork(
      id, input, req.auth.sub, req.auth.role as UserRole,
    )

    res.json({ success: true, data: artwork })
  } catch (err) {
    next(err)
  }
}

export async function handlePublishArtwork(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.auth) throw new UnauthorizedError()
    const { id } = req.params as { id: string }

    const artwork = await artworkService.publishArtwork(
      id, req.auth.sub, req.auth.role as UserRole,
    )

    res.json({ success: true, data: artwork })
  } catch (err) {
    next(err)
  }
}

export async function handleArchiveArtwork(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.auth) throw new UnauthorizedError()
    const { id } = req.params as { id: string }

    const artwork = await artworkService.archiveArtwork(
      id, req.auth.sub, req.auth.role as UserRole,
    )

    res.json({ success: true, data: artwork })
  } catch (err) {
    next(err)
  }
}

export async function handleDeleteArtwork(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.auth) throw new UnauthorizedError()
    const { id } = req.params as { id: string }

    await artworkService.deleteArtwork(
      id, req.auth.sub, req.auth.role as UserRole,
    )

    res.status(204).send()
  } catch (err) {
    next(err)
  }
}

export async function handleFlagArtwork(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    assertValid(req)
    if (!req.auth) throw new UnauthorizedError()

    const isModerator = req.auth.role === 'MODERATOR' || req.auth.role === 'ADMIN'
    if (!isModerator) throw new ForbiddenError('Insufficient permissions')

    const { id } = req.params as { id: string }
    const body = req.body as { notes: string; moderation_status: string }

    const artwork = await artworkService.flagArtwork(
      id,
      req.auth.sub,
      body.notes,
      body['moderation_status'] as any,
    )

    res.json({ success: true, data: artwork })
  } catch (err) {
    next(err)
  }
}

// ── Store: purchasable artwork fetch ─────────────────────────────────────────
// Used exclusively by the store product page and cart add-item flow.
// Returns the artwork only when it passes every purchasability check.
// Guests can call this — the store is publicly browsable.

export const purchasableArtworkValidation = [
  param('id').isUUID().withMessage('Invalid artwork id'),
]

export async function handleGetPurchasableArtwork(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    assertValid(req)
    const { id } = req.params as { id: string }
    const artwork = await artworkService.getPurchasableArtwork(id)
    res.json({ success: true, data: artwork })
  } catch (err) {
    next(err)
  }
}