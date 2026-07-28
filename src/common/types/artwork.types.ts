// ── Enums (mirror SQL enums exactly) ─────────────────────────────────────────

import { User, UserRole } from "."

export type ListingType = 'MARKETPLACE' | 'PORTFOLIO'
export type ArtworkFormat = 'DIGITAL' | 'PHYSICAL'
export type ArtworkMediaType = 'IMAGE' | 'VIDEO' | 'THREE_D' | 'EXTERNAL_LINK'
export type ArtworkVisibility = 'PUBLIC' | 'PRIVATE' | 'UNLISTED'
// PAUSED: set automatically when an approved seller is suspended or later
// rejected (after having published MARKETPLACE artwork) — hides the artwork
// from public discovery/purchase while preserving likes/comments/saves.
// Restored to PUBLISHED automatically on reactivation. See
// transition_seller_registration() in
// 20240701000000_seller_registration_schema.sql.
export type ArtworkStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'UNDER_REVIEW' | 'PAUSED'
export type ModerationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'FLAGGED'

// ── Nested JSONB shapes ───────────────────────────────────────────────────────

export type ArtworkAsset = {
  id: string
  original_url: string
  optimized_url: string | null
  thumbnail_url: string | null
  media_type: ArtworkMediaType
  width: number | null
  height: number | null
  duration_secs: number | null
  mime_type: string
  file_size_bytes: number
  ordering_index: number
}

export type PhysicalDetails = {
  length: number
  width: number
  height: number
  unit: 'cm' | 'in'
  available_quantity: number
  shipping_regions: string[]
  ships_worldwide: boolean
}

export type VariantOption = {
  id: string
  label: string              // e.g. "Small", "Red", "Oak"
  price_modifier: number     // delta from base price; can be negative
  sku: string | null
  stock: number | null       // null = unlimited
  is_available: boolean
}

export type Variant = {
  id: string
  type: 'SIZE' | 'COLOR' | 'MATERIAL' | 'FRAMING' | 'EDITION'
  name: string               // e.g. "Size", "Frame Style"
  options: VariantOption[]
}

// ── Core domain type ──────────────────────────────────────────────────────────

export type Artwork = {
  id: string
  listing_type: ListingType
  artwork_format: ArtworkFormat
  title: string
  description: string
  slug: string
  categories: string[]
  keywords: string[]
  creator_id: string
  creator: User
  collaborator_ids: string[]
  tools_used: string[]
  assets: ArtworkAsset[]
  visibility: ArtworkVisibility
  allow_moodboard_save: boolean
  allow_comments: boolean
  allow_likes: boolean
  show_engagement_stats: boolean
  status: ArtworkStatus
  is_flagged: boolean
  is_saved?: boolean
  moderation_status: ModerationStatus
  reviewed_by: string | null
  review_notes: string | null
  price: number | null
  currency: string
  max_purchase_quantity: number | null
  physical_details: PhysicalDetails | null
  has_variants: boolean
  variants: Variant[]
  view_count: number
  like_count: number
  save_count: number
  comment_count: number
  purchase_count: number
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}

// ── Input DTOs ────────────────────────────────────────────────────────────────

export type CreateArtworkInput = {
  listing_type: ListingType
  artwork_format: ArtworkFormat
  title: string
  description: string
  categories: string[]
  keywords: string[]
  collaborator_ids: string[]
  tools_used: string[]
  assets: Omit<ArtworkAsset, 'id'>[]
  visibility: ArtworkVisibility
  allow_moodboard_save: boolean
  allow_comments: boolean
  allow_likes: boolean
  show_engagement_stats: boolean
  status: string
  // marketplace-conditional
  price?: number
  currency?: string
  max_purchase_quantity?: number
  // physical-conditional
  physical_details?: PhysicalDetails
  // variants-conditional
  has_variants: boolean
  variants?: Omit<Variant, 'id'>[]
}

export type UpdateArtworkInput = Partial<Omit<
  CreateArtworkInput,
  'listing_type' | 'artwork_format'   // classification is immutable after creation
>>

export type ArtworkFilters = {
  creator_id?: string
  creator_ids?: string[]
  listing_type?: ListingType
  artwork_format?: ArtworkFormat
  status?: ArtworkStatus
  visibility?: ArtworkVisibility
  categories?: string[]
  min_price?: number
  max_price?: number
  search?: string
  location?: string   
  size_label?: string 
  page?: number
  limit?: number
  sort_by?: 'created_at' | 'like_count' | 'view_count' | 'price'
  sort_order?: 'asc' | 'desc'
}

export type PaginatedArtworks = {
  data: Artwork[]
  total: number
  page: number
  limit: number
  total_pages: number
  has_next: boolean
  has_prev: boolean
}

// ── Featured Artwork Types ────────────────────────────────────────────────────

export type FeaturedArtworkCreator = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  role: UserRole
}

export type FeaturedArtwork = {
  id: string
  slug: string
  title: string
  description: string
  thumbnail_url: string | null
  view_count: number
  like_count: number
  purchase_count: number
  created_at: Date
  creator: FeaturedArtworkCreator
}

// ── SSRF-safe external link config ────────────────────────────────────────────
// Used by the service layer to validate EXTERNAL_LINK assets before persisting.

export const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['https:'])

export const ALLOWED_EXTERNAL_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
  'image/svg+xml',
  'video/mp4', 'video/webm',
  'model/gltf-binary', 'model/gltf+json',
])

// Domains that are explicitly blocked regardless of protocol / MIME.
// Extend as needed; sourced from common phishing / SSRF pivot targets.
export const BLOCKED_EXTERNAL_HOSTS = new Set([
  'localhost', '127.0.0.1', '0.0.0.0', '::1',
  'metadata.google.internal', // GCP IMDS
  '169.254.169.254', // AWS/Azure IMDS
  '100.100.100.200', // Alibaba IMDS
])