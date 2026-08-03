import { cartRepository } from '../repositories/cart.repository'
import { artworkRepository } from '@/modules/artwork/repositories/artwork.repository'
import { enforceIsPurchasable } from '@/modules/artwork/services/artwork.service'
import { redisGetJson, redisSetJson, redisDel, RedisKeys, RedisTTL } from '@/modules/redis/redis.client'
import {
  NotFoundError,
  AppError,
  ValidationError,
} from '@/common/errors'
import type {
  Cart,
  CartItem,
  CartItemWithArtwork,
  CartVariantSnapshot,
  AddToCartInput,
  UpdateCartItemInput,
} from '@/common/types/commerce.types'
import type { Artwork, Variant, VariantOption } from '@/common/types/artwork.types'

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_CART_ITEMS     = 50
const DIGITAL_MAX_QTY   = 1

// ── Cache helpers ─────────────────────────────────────────────────────────────

function invalidateCartCache(userId: string): void {
  void redisDel(RedisKeys.cart(userId))
}

// ── Variant resolution ────────────────────────────────────────────────────────
// Finds a specific option by ID across all variant groups on an artwork.
// Returns undefined if the option does not exist or is unavailable.

function resolveVariantOption(
  artwork: Artwork,
  optionId: string,
): { variant: Variant; option: VariantOption } | undefined {
  for (const variant of artwork.variants) {
    const option = variant.options.find(o => o.id === optionId)
    if (option) return { variant, option }
  }
  return undefined
}

// ── Effective price ───────────────────────────────────────────────────────────
// Base price + variant price_modifier. Always derived from the artwork,
// never from client input.

function computeEffectivePrice(artwork: Artwork, option: VariantOption | null): number {
  const base     = artwork.price ?? 0
  const modifier = option?.price_modifier ?? 0
  return Math.max(0, base + modifier)
}

// ── Stock availability check ──────────────────────────────────────────────────
// Returns true when the requested quantity is satisfiable.
// null stock on VariantOption means unlimited.

function isStockSufficient(artwork: Artwork, option: VariantOption | null, quantity: number): boolean {
  if (artwork.artwork_format === 'PHYSICAL') {
    const available = artwork.physical_details?.available_quantity ?? 0
    if (available < quantity) return false
  }
  if (option?.stock !== null && option?.stock !== undefined) {
    if (option.stock < quantity) return false
  }
  return true
}

// ── Staleness computation ─────────────────────────────────────────────────────
// Runs against each enriched cart item to set the three staleness flags.
// Called every time the cart is fetched — we never store these in the DB.

function computeStaleness(item: CartItemWithArtwork): CartItemWithArtwork {
  const { artwork, variant_snapshot } = item

  const isUnavailable =
    artwork.listing_type !== 'MARKETPLACE' ||
    artwork.status !== 'PUBLISHED' ||
    artwork.moderation_status !== 'APPROVED'

  let currentPrice = artwork.price ?? 0
  let optionForStock: VariantOption | null = null

  if (variant_snapshot) {
    // Re-resolve the option from live artwork data to detect removal/price changes
    const resolved = artwork.has_variants
      ? (artwork as any).variants?.flatMap((v: Variant) => v.options).find(
          (o: VariantOption) => o.id === variant_snapshot.option_id,
        ) ?? null
      : null

    if (!resolved || !resolved.is_available) {
      // Variant option was removed or disabled
      return { ...item, is_unavailable: true, is_price_changed: false, is_stock_insufficient: false }
    }

    optionForStock = resolved
    currentPrice   = computeEffectivePrice(artwork as any, resolved)
  }

  const isPriceChanged      = currentPrice !== item.price_at_add
  const isStockInsufficient = !isUnavailable && !isStockSufficient(artwork as any, optionForStock, item.quantity)

  return {
    ...item,
    is_unavailable:        isUnavailable,
    is_price_changed:      isPriceChanged,
    is_stock_insufficient: isStockInsufficient,
  }
}

// ── buildCartSummary ──────────────────────────────────────────────────────────
// Derives the Cart aggregate from enriched items.
// Subtotal uses price_at_add (what the buyer expects to pay).
// The checkout service will re-validate and use current prices.

function buildCartSummary(items: CartItemWithArtwork[]): Cart {
  const subtotal = items.reduce(
    (sum, item) => sum + item.price_at_add * item.quantity,
    0,
  )

  const hasStaleItems = items.some(
    i => i.is_price_changed || i.is_unavailable || i.is_stock_insufficient,
  )

  return {
    items,
    item_count: items.length,
    subtotal:   Math.round(subtotal * 100) / 100,
    currency:   items[0]?.currency_at_add ?? 'USDT',
    has_stale_items: hasStaleItems,
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

export const cartService = {

  // ── getCart ───────────────────────────────────────────────────────────────
  // Returns the full cart with live staleness flags.
  // Cache is on the raw items array. Staleness is always recomputed on read
  // so a moderation action or price change is reflected immediately.

  async getCart(userId: string): Promise<Cart> {
    const cached = await redisGetJson<CartItemWithArtwork[]>(RedisKeys.cart(userId))

    let items: CartItemWithArtwork[]

    if (cached) {
      items = cached
    } else {
      items = await cartRepository.findByUser(userId)
      void redisSetJson(RedisKeys.cart(userId), items, RedisTTL.cart)
    }

    const itemsWithStaleness = items.map(computeStaleness)
    return buildCartSummary(itemsWithStaleness)
  },

  // ── addItem ───────────────────────────────────────────────────────────────

  async addItem(userId: string, input: AddToCartInput): Promise<Cart> {
    // 1. Fetch artwork and enforce purchasability — single source of truth
    const artwork = await artworkRepository.findPurchasableById(input.artwork_id)
    if (!artwork) {
      throw new AppError(
        'Artwork is not available for purchase',
        404,
        'ARTWORK_NOT_PURCHASABLE',
      )
    }
    enforceIsPurchasable(artwork)

    // 2. Variant resolution
    let resolvedOption: VariantOption | null = null
    let variantSnapshot: CartVariantSnapshot | null = null

    if (artwork.has_variants) {
      if (!input.variant_option_id) {
        throw new ValidationError('Validation failed', {
          variant_option_id: 'A variant option must be selected for this artwork',
        })
      }

      const resolved = resolveVariantOption(artwork, input.variant_option_id)
      if (!resolved) {
        throw new AppError(
          'The selected variant option does not exist',
          422,
          'VARIANT_OPTION_NOT_FOUND',
        )
      }
      if (!resolved.option.is_available) {
        throw new AppError(
          'The selected variant option is not currently available',
          422,
          'VARIANT_OPTION_UNAVAILABLE',
        )
      }

      resolvedOption  = resolved.option
      variantSnapshot = {
        variant_id:     resolved.variant.id,
        variant_type:   resolved.variant.type,
        variant_name:   resolved.variant.name,
        option_id:      resolved.option.id,
        option_label:   resolved.option.label,
        price_modifier: resolved.option.price_modifier,
      }
    } else if (input.variant_option_id) {
      // Caller passed a variant option for an artwork that has no variants
      throw new ValidationError('Validation failed', {
        variant_option_id: 'This artwork does not have variants',
      })
    }

    // 3. Digital artwork — enforce max qty 1 and prevent re-purchase
    if (artwork.artwork_format === 'DIGITAL') {
      if (input.quantity !== 1) {
        throw new ValidationError('Validation failed', {
          quantity: 'Digital artworks can only be purchased once (quantity must be 1)',
        })
      }

      const existing = await cartRepository.findExistingLine(
        userId,
        artwork.id,
        variantSnapshot?.option_id ?? null,
      )
      if (existing) {
        throw new AppError(
          'This digital artwork is already in your cart',
          409,
          'DIGITAL_ALREADY_IN_CART',
        )
      }
    }

    // 4. Quantity bounds
    const maxAllowed = artwork.max_purchase_quantity ?? 100
    if (input.quantity < 1 || input.quantity > maxAllowed) {
      throw new ValidationError('Validation failed', {
        quantity: `Quantity must be between 1 and ${maxAllowed}`,
      })
    }

    // 5. Stock check — advisory, Postgres RPC enforces atomically at checkout
    if (!isStockSufficient(artwork, resolvedOption, input.quantity)) {
      throw new AppError(
        'Insufficient stock for the requested quantity',
        422,
        'INSUFFICIENT_STOCK',
      )
    }

    // 6. Cart size cap
    const currentCount = await cartRepository.countByUser(userId)
    if (currentCount >= MAX_CART_ITEMS) {
      throw new AppError(
        `Cart cannot exceed ${MAX_CART_ITEMS} items`,
        422,
        'CART_LIMIT_REACHED',
      )
    }

    // 7. Compute price snapshot
    const effectivePrice = computeEffectivePrice(artwork, resolvedOption)

    // 8. Persist
    await cartRepository.insert({
      user_id:          userId,
      artwork_id:       artwork.id,
      quantity:         input.quantity,
      price_at_add:     effectivePrice,
      currency_at_add:  artwork.currency,
      variant_snapshot: variantSnapshot,
    })

    invalidateCartCache(userId)
    return this.getCart(userId)
  },

  // ── updateQuantity ────────────────────────────────────────────────────────

  async updateQuantity(
    userId: string,
    itemId: string,
    input: UpdateCartItemInput,
  ): Promise<Cart> {
    const item = await cartRepository.findItemById(itemId, userId)
    if (!item) throw new NotFoundError('Cart item')

    // Fetch live artwork to validate the new quantity against current constraints
    const artwork = await artworkRepository.findById(item.artwork_id)
    if (!artwork) {
      // Artwork was deleted — remove the stale cart row silently
      await cartRepository.deleteItem(itemId, userId)
      invalidateCartCache(userId)
      return this.getCart(userId)
    }

    if (artwork.artwork_format === 'DIGITAL') {
      throw new AppError(
        'Quantity cannot be changed for digital artworks',
        422,
        'DIGITAL_QUANTITY_IMMUTABLE',
      )
    }

    if (input.quantity < 1) {
      throw new ValidationError('Validation failed', {
        quantity: 'Quantity must be at least 1. To remove an item, use the remove endpoint.',
      })
    }

    const maxAllowed = artwork.max_purchase_quantity ?? 100
    if (input.quantity > maxAllowed) {
      throw new ValidationError('Validation failed', {
        quantity: `Quantity cannot exceed ${maxAllowed} for this artwork`,
      })
    }

    // Resolve variant option for stock check if applicable
    let option: VariantOption | null = null
    if (item.variant_snapshot) {
      const resolved = resolveVariantOption(artwork, item.variant_snapshot.option_id)
      option = resolved?.option ?? null
    }

    if (!isStockSufficient(artwork, option, input.quantity)) {
      throw new AppError(
        'Insufficient stock for the requested quantity',
        422,
        'INSUFFICIENT_STOCK',
      )
    }

    await cartRepository.updateQuantity(itemId, userId, input.quantity)
    invalidateCartCache(userId)
    return this.getCart(userId)
  },

  // ── removeItem ────────────────────────────────────────────────────────────

  async removeItem(userId: string, itemId: string): Promise<Cart> {
    const item = await cartRepository.findItemById(itemId, userId)
    if (!item) throw new NotFoundError('Cart item')

    await cartRepository.deleteItem(itemId, userId)
    invalidateCartCache(userId)
    return this.getCart(userId)
  },

  // ── clearCart ─────────────────────────────────────────────────────────────

  async clearCart(userId: string): Promise<void> {
    await cartRepository.clearCart(userId)
    invalidateCartCache(userId)
  },

  // ── validateItemsForCheckout ──────────────────────────────────────────────
  // Called by the order service before creating an order. Re-validates each
  // selected item against live artwork data. Returns validated items with
  // their current effective prices — the order service uses these for
  // server-side total calculation. Never trusts client-provided prices.

  async validateItemsForCheckout(
    userId: string,
    cartItemIds: string[],
  ): Promise<Array<CartItemWithArtwork & { effective_price: number }>> {
    if (!cartItemIds.length) {
      throw new ValidationError('Validation failed', {
        cart_item_ids: 'At least one cart item must be selected for checkout',
      })
    }

    const allItems = await cartRepository.findByUser(userId)
    const selectedItems = allItems.filter(item => cartItemIds.includes(item.id))

    if (selectedItems.length !== cartItemIds.length) {
      throw new AppError(
        'One or more cart items were not found',
        422,
        'CART_ITEMS_NOT_FOUND',
      )
    }

    const validated: Array<CartItemWithArtwork & { effective_price: number }> = []

    for (const item of selectedItems) {
      // Re-fetch live artwork for each item — this is intentionally not cached
      // because the checkout path requires the freshest data
      const artwork = await artworkRepository.findPurchasableById(item.artwork_id)
      if (!artwork) {
        throw new AppError(
          `Artwork "${item.artwork.title}" is no longer available for purchase`,
          422,
          'ARTWORK_NOT_PURCHASABLE',
        )
      }

      enforceIsPurchasable(artwork)

      // Re-resolve variant
      let option: VariantOption | null = null
      if (item.variant_snapshot) {
        const resolved = resolveVariantOption(artwork, item.variant_snapshot.option_id)
        if (!resolved || !resolved.option.is_available) {
          throw new AppError(
            `The selected variant for "${artwork.title}" is no longer available`,
            422,
            'VARIANT_OPTION_UNAVAILABLE',
          )
        }
        option = resolved.option
      }

      // Stock check
      if (!isStockSufficient(artwork, option, item.quantity)) {
        throw new AppError(
          `Insufficient stock for "${artwork.title}"`,
          422,
          'INSUFFICIENT_STOCK',
        )
      }

      const effectivePrice = computeEffectivePrice(artwork, option)

      validated.push({
        ...item,
        artwork: {
          ...item.artwork,
          price:    artwork.price,
          currency: artwork.currency,
        },
        effective_price:       effectivePrice,
        is_price_changed:      effectivePrice !== item.price_at_add,
        is_unavailable:        false,
        is_stock_insufficient: false,
      })
    }

    return validated
  },
}