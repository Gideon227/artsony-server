import type { Artwork, Variant, VariantOption } from '../../src/common/types/artwork.types'
import type {
  CartItem,
  CartItemWithArtwork,
  CartVariantSnapshot,
} from '../../src/common/types/commerce.types'

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../src/modules/cart/repositories/cart.repository', () => ({
  cartRepository: {
    findByUser:       jest.fn(),
    findItemById:     jest.fn(),
    findExistingLine: jest.fn(),
    countByUser:      jest.fn(),
    insert:           jest.fn(),
    updateQuantity:   jest.fn(),
    deleteItem:       jest.fn(),
    deleteItems:      jest.fn(),
    clearCart:        jest.fn(),
  },
}))

jest.mock('../../src/modules/artwork/repositories/artwork.repository', () => ({
  artworkRepository: {
    findPurchasableById: jest.fn(),
    findById:            jest.fn(),
  },
}))

jest.mock('../../src/modules/artwork/services/artwork.service', () => ({
  enforceIsPurchasable: jest.fn(),
}))

jest.mock('../../src/modules/redis/redis.client', () => ({
  redisGet: jest.fn().mockResolvedValue(null),
  redisSet: jest.fn().mockResolvedValue(undefined),
  redisDel: jest.fn().mockResolvedValue(undefined),
}))

import { cartService } from '../../src/modules/cart/services/cart.service'
import { cartRepository } from '../../src/modules/cart/repositories/cart.repository'
import { artworkRepository } from '../../src/modules/artwork/repositories/artwork.repository'
import { enforceIsPurchasable } from '../../src/modules/artwork/services/artwork.service'
import { redisGet } from '../../src/modules/redis/redis.client'
import { AppError, ValidationError, NotFoundError } from '../../src/common/errors'

const mockCartRepo    = cartRepository as jest.Mocked<typeof cartRepository>
const mockArtworkRepo = artworkRepository as jest.Mocked<typeof artworkRepository>
const mockEnforce     = enforceIsPurchasable as jest.MockedFunction<typeof enforceIsPurchasable>
const mockRedisGet    = redisGet as jest.MockedFunction<typeof redisGet>

// ── Factories ─────────────────────────────────────────────────────────────────

function makeArtwork(overrides: Partial<Artwork> = {}): Artwork {
  return {
    id:                   'artwork-1',
    listing_type:         'MARKETPLACE',
    artwork_format:       'DIGITAL',
    title:                'Test Artwork',
    description:          'desc',
    slug:                 'test-artwork',
    categories:           [],
    keywords:             [],
    creator_id:           'seller-1',
    creator:              null as any,
    collaborator_ids:     [],
    tools_used:           [],
    assets:               [],
    visibility:           'PUBLIC',
    allow_moodboard_save: true,
    allow_comments:       true,
    allow_likes:          true,
    show_engagement_stats:true,
    status:               'PUBLISHED',
    is_flagged:           false,
    moderation_status:    'APPROVED',
    reviewed_by:          null,
    review_notes:         null,
    is_for_sale:          true,
    price:                100,
    currency:             'USDT',
    max_purchase_quantity:null,
    physical_details:     null,
    has_variants:         false,
    variants:             [],
    thumbnail_url:        'https://res.cloudinary.com/test/thumb.jpg',
    view_count:           0,
    like_count:           0,
    save_count:           0,
    comment_count:        0,
    purchase_count:       0,
    created_at:           new Date(),
    updated_at:           new Date(),
    deleted_at:           null,
    ...overrides,
  } as unknown as Artwork
}

function makeVariantOption(overrides: Partial<VariantOption> = {}): VariantOption {
  return {
    id:             'option-1',
    label:          'Small',
    price_modifier: 0,
    sku:            null,
    stock:          10,
    is_available:   true,
    ...overrides,
  }
}

function makeVariant(options: VariantOption[] = []): Variant {
  return {
    id:      'variant-1',
    type:    'SIZE',
    name:    'Size',
    options: options.length ? options : [makeVariantOption()],
  }
}

function makeCartItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    id:               'item-1',
    user_id:          'user-1',
    artwork_id:       'artwork-1',
    quantity:         1,
    price_at_add:     100,
    currency_at_add:  'USDT',
    variant_snapshot: null,
    added_at:         new Date(),
    ...overrides,
  }
}

function makeCartItemWithArtwork(
  item: Partial<CartItem> = {},
  artworkOverrides: Partial<Artwork> = {},
): CartItemWithArtwork {
  const artwork = makeArtwork(artworkOverrides)
  return {
    ...makeCartItem(item),
    artwork: {
      id:                   artwork.id,
      title:                artwork.title,
      slug:                 artwork.slug,
      thumbnail_url:        artwork.thumbnail_url ?? null,
      artwork_format:       artwork.artwork_format,
      listing_type:         artwork.listing_type,
      status:               artwork.status,
      moderation_status:    artwork.moderation_status,
      price:                artwork.price,
      currency:             artwork.currency,
      max_purchase_quantity:artwork.max_purchase_quantity,
      has_variants:         artwork.has_variants,
      seller_id:            artwork.creator_id,
      seller_name:          'Test Seller',
      seller_avatar_url:    null,
    },
    is_price_changed:      false,
    is_unavailable:        false,
    is_stock_insufficient: false,
  }
}

// ── Shared setup ──────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
  mockRedisGet.mockResolvedValue(null)
  mockEnforce.mockReturnValue(undefined)
})

// ═════════════════════════════════════════════════════════════════════════════
// getCart
// ═════════════════════════════════════════════════════════════════════════════

describe('cartService.getCart', () => {
  it('returns an empty cart when user has no items', async () => {
    mockCartRepo.findByUser.mockResolvedValue([])

    const cart = await cartService.getCart('user-1')

    expect(cart.items).toHaveLength(0)
    expect(cart.item_count).toBe(0)
    expect(cart.subtotal).toBe(0)
    expect(cart.has_stale_items).toBe(false)
  })

  it('returns items from DB when cache is cold', async () => {
    mockRedisGet.mockResolvedValue(null)
    const item = makeCartItemWithArtwork()
    mockCartRepo.findByUser.mockResolvedValue([item])

    const cart = await cartService.getCart('user-1')

    expect(mockCartRepo.findByUser).toHaveBeenCalledWith('user-1')
    expect(cart.items).toHaveLength(1)
  })

  it('returns items from cache and skips DB when cache is warm', async () => {
    const item = makeCartItemWithArtwork()
    mockRedisGet.mockResolvedValue(JSON.stringify([item]))

    await cartService.getCart('user-1')

    expect(mockCartRepo.findByUser).not.toHaveBeenCalled()
  })

  it('computes subtotal as sum of price_at_add × quantity', async () => {
    const item1 = makeCartItemWithArtwork({ price_at_add: 100, quantity: 2 })
    const item2 = makeCartItemWithArtwork({ id: 'item-2', price_at_add: 50,  quantity: 1 })
    mockCartRepo.findByUser.mockResolvedValue([item1, item2])

    const cart = await cartService.getCart('user-1')

    expect(cart.subtotal).toBe(250)
  })

  it('sets has_stale_items=true when a price has changed', async () => {
    // price_at_add differs from artwork.price → staleness detected
    const item = makeCartItemWithArtwork(
      { price_at_add: 100 },
      { price: 120 },
    )
    mockCartRepo.findByUser.mockResolvedValue([item])

    const cart = await cartService.getCart('user-1')

    expect(cart.has_stale_items).toBe(true)
    expect(cart.items[0]!.is_price_changed).toBe(true)
  })

  it('sets has_stale_items=true when artwork is no longer published', async () => {
    const item = makeCartItemWithArtwork({}, { status: 'ARCHIVED' })
    mockCartRepo.findByUser.mockResolvedValue([item])

    const cart = await cartService.getCart('user-1')

    expect(cart.has_stale_items).toBe(true)
    expect(cart.items[0]!.is_unavailable).toBe(true)
  })

  it('sets has_stale_items=true when artwork is not MARKETPLACE', async () => {
    const item = makeCartItemWithArtwork({}, { listing_type: 'PORTFOLIO' })
    mockCartRepo.findByUser.mockResolvedValue([item])

    const cart = await cartService.getCart('user-1')

    expect(cart.items[0]!.is_unavailable).toBe(true)
  })

  it('sets is_unavailable=true when variant snapshot option is no longer available', async () => {
    const snapshot: CartVariantSnapshot = {
      variant_id:     'variant-1',
      variant_type:   'SIZE',
      variant_name:   'Size',
      option_id:      'option-1',
      option_label:   'Small',
      price_modifier: 0,
    }
    const unavailableOption = makeVariantOption({ id: 'option-1', is_available: false })
    const artwork = makeArtwork({
      has_variants: true,
      variants:     [makeVariant([unavailableOption])],
    })
    const item = makeCartItemWithArtwork({ variant_snapshot: snapshot }, artwork)
    mockCartRepo.findByUser.mockResolvedValue([item])

    const cart = await cartService.getCart('user-1')

    expect(cart.items[0]!.is_unavailable).toBe(true)
  })

  it('sets is_unavailable=true when variant snapshot option no longer exists', async () => {
    const snapshot: CartVariantSnapshot = {
      variant_id:     'variant-1',
      variant_type:   'SIZE',
      variant_name:   'Size',
      option_id:      'deleted-option',
      option_label:   'Medium',
      price_modifier: 0,
    }
    const artwork = makeArtwork({
      has_variants: true,
      variants:     [makeVariant([makeVariantOption({ id: 'option-1' })])],
    })
    const item = makeCartItemWithArtwork({ variant_snapshot: snapshot }, artwork)
    mockCartRepo.findByUser.mockResolvedValue([item])

    const cart = await cartService.getCart('user-1')

    expect(cart.items[0]!.is_unavailable).toBe(true)
  })

  it('sets is_price_changed=true when variant price_modifier changed', async () => {
    const snapshot: CartVariantSnapshot = {
      variant_id:     'variant-1',
      variant_type:   'SIZE',
      variant_name:   'Size',
      option_id:      'option-1',
      option_label:   'Small',
      price_modifier: 10,
    }
    // price_at_add was 110 (100 base + 10 modifier)
    // Now modifier is 25 → effective price is 125 → changed
    const option  = makeVariantOption({ id: 'option-1', price_modifier: 25 })
    const artwork = makeArtwork({ price: 100, has_variants: true, variants: [makeVariant([option])] })
    const item    = makeCartItemWithArtwork({ price_at_add: 110, variant_snapshot: snapshot }, artwork)
    mockCartRepo.findByUser.mockResolvedValue([item])

    const cart = await cartService.getCart('user-1')

    expect(cart.items[0]!.is_price_changed).toBe(true)
  })

  it('sets is_stock_insufficient=true for physical artwork when stock is below quantity', async () => {
    const artwork = makeArtwork({
      artwork_format:  'PHYSICAL',
      physical_details:{ available_quantity: 1 } as any,
    })
    const item = makeCartItemWithArtwork({ quantity: 5 }, artwork)
    mockCartRepo.findByUser.mockResolvedValue([item])

    const cart = await cartService.getCart('user-1')

    expect(cart.items[0]!.is_stock_insufficient).toBe(true)
    expect(cart.has_stale_items).toBe(true)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// addItem
// ═════════════════════════════════════════════════════════════════════════════

describe('cartService.addItem', () => {
  beforeEach(() => {
    mockCartRepo.countByUser.mockResolvedValue(0)
    mockCartRepo.insert.mockResolvedValue(makeCartItem())
    mockCartRepo.findByUser.mockResolvedValue([])
  })

  it('inserts a valid digital artwork with no variants', async () => {
    const artwork = makeArtwork()
    mockArtworkRepo.findPurchasableById.mockResolvedValue(artwork)
    mockCartRepo.findExistingLine.mockResolvedValue(undefined)

    await cartService.addItem('user-1', { artwork_id: 'artwork-1', quantity: 1 })

    expect(mockCartRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id:          'user-1',
        artwork_id:       'artwork-1',
        quantity:         1,
        price_at_add:     100,
        currency_at_add:  'USDT',
        variant_snapshot: null,
      }),
    )
  })

  it('inserts a physical artwork with quantity > 1', async () => {
    const artwork = makeArtwork({
      artwork_format:   'PHYSICAL',
      physical_details: { available_quantity: 10 } as any,
    })
    mockArtworkRepo.findPurchasableById.mockResolvedValue(artwork)

    await cartService.addItem('user-1', { artwork_id: 'artwork-1', quantity: 3 })

    expect(mockCartRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: 3 }),
    )
  })

  it('resolves variant option and snapshots it correctly', async () => {
    const option  = makeVariantOption({ id: 'opt-1', label: 'Large', price_modifier: 20 })
    const variant = makeVariant([option])
    const artwork = makeArtwork({
      artwork_format: 'PHYSICAL',
      price:          100,
      has_variants:   true,
      variants:       [variant],
      physical_details: { available_quantity: 10 } as any,
    })
    mockArtworkRepo.findPurchasableById.mockResolvedValue(artwork)

    await cartService.addItem('user-1', {
      artwork_id:        'artwork-1',
      quantity:          1,
      variant_option_id: 'opt-1',
    })

    expect(mockCartRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        price_at_add:     120,  // 100 base + 20 modifier
        variant_snapshot: expect.objectContaining({
          option_id:      'opt-1',
          option_label:   'Large',
          price_modifier: 20,
        }),
      }),
    )
  })

  it('computes effective price correctly with negative price_modifier', async () => {
    const option  = makeVariantOption({ id: 'opt-1', price_modifier: -15 })
    const variant = makeVariant([option])
    const artwork = makeArtwork({
      artwork_format:   'PHYSICAL',
      price:            100,
      has_variants:     true,
      variants:         [variant],
      physical_details: { available_quantity: 5 } as any,
    })
    mockArtworkRepo.findPurchasableById.mockResolvedValue(artwork)

    await cartService.addItem('user-1', {
      artwork_id:        'artwork-1',
      quantity:          1,
      variant_option_id: 'opt-1',
    })

    expect(mockCartRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ price_at_add: 85 }),
    )
  })

  it('throws ARTWORK_NOT_PURCHASABLE when artwork is not found', async () => {
    mockArtworkRepo.findPurchasableById.mockResolvedValue(undefined)

    await expect(
      cartService.addItem('user-1', { artwork_id: 'artwork-1', quantity: 1 }),
    ).rejects.toMatchObject({ code: 'ARTWORK_NOT_PURCHASABLE' })
  })

  it('throws ValidationError when variant artwork receives no variant_option_id', async () => {
    const artwork = makeArtwork({
      has_variants: true,
      variants:     [makeVariant()],
    })
    mockArtworkRepo.findPurchasableById.mockResolvedValue(artwork)

    await expect(
      cartService.addItem('user-1', { artwork_id: 'artwork-1', quantity: 1 }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('throws VARIANT_OPTION_NOT_FOUND when option id does not exist', async () => {
    const artwork = makeArtwork({
      has_variants: true,
      variants:     [makeVariant([makeVariantOption({ id: 'opt-real' })])],
    })
    mockArtworkRepo.findPurchasableById.mockResolvedValue(artwork)

    await expect(
      cartService.addItem('user-1', {
        artwork_id:        'artwork-1',
        quantity:          1,
        variant_option_id: 'opt-fake',
      }),
    ).rejects.toMatchObject({ code: 'VARIANT_OPTION_NOT_FOUND' })
  })

  it('throws VARIANT_OPTION_UNAVAILABLE when option is_available=false', async () => {
    const option  = makeVariantOption({ id: 'opt-1', is_available: false })
    const artwork = makeArtwork({
      has_variants: true,
      variants:     [makeVariant([option])],
    })
    mockArtworkRepo.findPurchasableById.mockResolvedValue(artwork)

    await expect(
      cartService.addItem('user-1', {
        artwork_id:        'artwork-1',
        quantity:          1,
        variant_option_id: 'opt-1',
      }),
    ).rejects.toMatchObject({ code: 'VARIANT_OPTION_UNAVAILABLE' })
  })

  it('throws ValidationError when variant_option_id passed for non-variant artwork', async () => {
    const artwork = makeArtwork({ has_variants: false, variants: [] })
    mockArtworkRepo.findPurchasableById.mockResolvedValue(artwork)

    await expect(
      cartService.addItem('user-1', {
        artwork_id:        'artwork-1',
        quantity:          1,
        variant_option_id: 'some-id',
      }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('throws ValidationError when digital artwork quantity > 1', async () => {
    const artwork = makeArtwork({ artwork_format: 'DIGITAL' })
    mockArtworkRepo.findPurchasableById.mockResolvedValue(artwork)

    await expect(
      cartService.addItem('user-1', { artwork_id: 'artwork-1', quantity: 2 }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('throws DIGITAL_ALREADY_IN_CART when digital artwork already in cart', async () => {
    const artwork = makeArtwork({ artwork_format: 'DIGITAL' })
    mockArtworkRepo.findPurchasableById.mockResolvedValue(artwork)
    mockCartRepo.findExistingLine.mockResolvedValue(makeCartItem())

    await expect(
      cartService.addItem('user-1', { artwork_id: 'artwork-1', quantity: 1 }),
    ).rejects.toMatchObject({ code: 'DIGITAL_ALREADY_IN_CART' })
  })

  it('throws ValidationError when quantity exceeds max_purchase_quantity', async () => {
    const artwork = makeArtwork({
      artwork_format:       'PHYSICAL',
      max_purchase_quantity: 2,
      physical_details:     { available_quantity: 100 } as any,
    })
    mockArtworkRepo.findPurchasableById.mockResolvedValue(artwork)

    await expect(
      cartService.addItem('user-1', { artwork_id: 'artwork-1', quantity: 5 }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('throws INSUFFICIENT_STOCK when physical stock is below quantity', async () => {
    const artwork = makeArtwork({
      artwork_format:   'PHYSICAL',
      physical_details: { available_quantity: 1 } as any,
    })
    mockArtworkRepo.findPurchasableById.mockResolvedValue(artwork)

    await expect(
      cartService.addItem('user-1', { artwork_id: 'artwork-1', quantity: 3 }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' })
  })

  it('throws INSUFFICIENT_STOCK when variant stock is below quantity', async () => {
    const option  = makeVariantOption({ id: 'opt-1', stock: 2 })
    const artwork = makeArtwork({
      artwork_format:   'PHYSICAL',
      has_variants:     true,
      variants:         [makeVariant([option])],
      physical_details: { available_quantity: 100 } as any,
    })
    mockArtworkRepo.findPurchasableById.mockResolvedValue(artwork)

    await expect(
      cartService.addItem('user-1', {
        artwork_id:        'artwork-1',
        quantity:          5,
        variant_option_id: 'opt-1',
      }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' })
  })

  it('does not check stock for variant with null stock (unlimited)', async () => {
    const option  = makeVariantOption({ id: 'opt-1', stock: null })
    const artwork = makeArtwork({
      artwork_format:   'PHYSICAL',
      has_variants:     true,
      variants:         [makeVariant([option])],
      physical_details: { available_quantity: 100 } as any,
    })
    mockArtworkRepo.findPurchasableById.mockResolvedValue(artwork)

    await expect(
      cartService.addItem('user-1', {
        artwork_id:        'artwork-1',
        quantity:          99,
        variant_option_id: 'opt-1',
      }),
    ).resolves.toBeDefined()
  })

  it('throws CART_LIMIT_REACHED when cart has 50 items', async () => {
    const artwork = makeArtwork()
    mockArtworkRepo.findPurchasableById.mockResolvedValue(artwork)
    mockCartRepo.findExistingLine.mockResolvedValue(undefined)
    mockCartRepo.countByUser.mockResolvedValue(50)

    await expect(
      cartService.addItem('user-1', { artwork_id: 'artwork-1', quantity: 1 }),
    ).rejects.toMatchObject({ code: 'CART_LIMIT_REACHED' })
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// updateQuantity
// ═════════════════════════════════════════════════════════════════════════════

describe('cartService.updateQuantity', () => {
  beforeEach(() => {
    mockCartRepo.findByUser.mockResolvedValue([])
    mockCartRepo.updateQuantity.mockResolvedValue(makeCartItem())
  })

  it('updates quantity for a physical artwork', async () => {
    const cartItem = makeCartItem({ artwork_id: 'artwork-1' })
    const artwork  = makeArtwork({
      artwork_format:   'PHYSICAL',
      physical_details: { available_quantity: 10 } as any,
    })
    mockCartRepo.findItemById.mockResolvedValue(cartItem)
    mockArtworkRepo.findById.mockResolvedValue(artwork)

    await cartService.updateQuantity('user-1', 'item-1', { quantity: 4 })

    expect(mockCartRepo.updateQuantity).toHaveBeenCalledWith('item-1', 'user-1', 4)
  })

  it('throws DIGITAL_QUANTITY_IMMUTABLE for digital artwork', async () => {
    const cartItem = makeCartItem()
    const artwork  = makeArtwork({ artwork_format: 'DIGITAL' })
    mockCartRepo.findItemById.mockResolvedValue(cartItem)
    mockArtworkRepo.findById.mockResolvedValue(artwork)

    await expect(
      cartService.updateQuantity('user-1', 'item-1', { quantity: 2 }),
    ).rejects.toMatchObject({ code: 'DIGITAL_QUANTITY_IMMUTABLE' })
  })

  it('throws NotFoundError when cart item does not belong to user', async () => {
    mockCartRepo.findItemById.mockResolvedValue(undefined)

    await expect(
      cartService.updateQuantity('user-1', 'item-x', { quantity: 2 }),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('silently removes item and returns cart when artwork has been deleted', async () => {
    mockCartRepo.findItemById.mockResolvedValue(makeCartItem())
    mockArtworkRepo.findById.mockResolvedValue(undefined)
    mockCartRepo.deleteItem.mockResolvedValue(undefined)

    const cart = await cartService.updateQuantity('user-1', 'item-1', { quantity: 2 })

    expect(mockCartRepo.deleteItem).toHaveBeenCalledWith('item-1', 'user-1')
    expect(cart).toBeDefined()
  })

  it('throws ValidationError when quantity exceeds max_purchase_quantity', async () => {
    const artwork = makeArtwork({
      artwork_format:       'PHYSICAL',
      max_purchase_quantity: 3,
      physical_details:     { available_quantity: 100 } as any,
    })
    mockCartRepo.findItemById.mockResolvedValue(makeCartItem())
    mockArtworkRepo.findById.mockResolvedValue(artwork)

    await expect(
      cartService.updateQuantity('user-1', 'item-1', { quantity: 10 }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('throws INSUFFICIENT_STOCK when new quantity exceeds physical stock', async () => {
    const artwork = makeArtwork({
      artwork_format:   'PHYSICAL',
      physical_details: { available_quantity: 2 } as any,
    })
    mockCartRepo.findItemById.mockResolvedValue(makeCartItem())
    mockArtworkRepo.findById.mockResolvedValue(artwork)

    await expect(
      cartService.updateQuantity('user-1', 'item-1', { quantity: 5 }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' })
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// removeItem
// ═════════════════════════════════════════════════════════════════════════════

describe('cartService.removeItem', () => {
  it('removes the item and returns updated cart', async () => {
    mockCartRepo.findItemById.mockResolvedValue(makeCartItem())
    mockCartRepo.deleteItem.mockResolvedValue(undefined)
    mockCartRepo.findByUser.mockResolvedValue([])

    const cart = await cartService.removeItem('user-1', 'item-1')

    expect(mockCartRepo.deleteItem).toHaveBeenCalledWith('item-1', 'user-1')
    expect(cart.items).toHaveLength(0)
  })

  it('throws NotFoundError when item does not exist for user', async () => {
    mockCartRepo.findItemById.mockResolvedValue(undefined)

    await expect(
      cartService.removeItem('user-1', 'nonexistent'),
    ).rejects.toBeInstanceOf(NotFoundError)
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// clearCart
// ═════════════════════════════════════════════════════════════════════════════

describe('cartService.clearCart', () => {
  it('calls clearCart on repository and invalidates cache', async () => {
    mockCartRepo.clearCart.mockResolvedValue(undefined)

    await cartService.clearCart('user-1')

    expect(mockCartRepo.clearCart).toHaveBeenCalledWith('user-1')
  })
})

// ═════════════════════════════════════════════════════════════════════════════
// validateItemsForCheckout
// ═════════════════════════════════════════════════════════════════════════════

describe('cartService.validateItemsForCheckout', () => {
  it('throws ValidationError when no item IDs provided', async () => {
    await expect(
      cartService.validateItemsForCheckout('user-1', []),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('throws CART_ITEMS_NOT_FOUND when IDs dont match users cart', async () => {
    mockCartRepo.findByUser.mockResolvedValue([makeCartItemWithArtwork({ id: 'item-a' })])

    await expect(
      cartService.validateItemsForCheckout('user-1', ['item-x']),
    ).rejects.toMatchObject({ code: 'CART_ITEMS_NOT_FOUND' })
  })

  it('throws ARTWORK_NOT_PURCHASABLE when artwork is no longer purchasable', async () => {
    const item = makeCartItemWithArtwork({ id: 'item-1' })
    mockCartRepo.findByUser.mockResolvedValue([item])
    mockArtworkRepo.findPurchasableById.mockResolvedValue(undefined)

    await expect(
      cartService.validateItemsForCheckout('user-1', ['item-1']),
    ).rejects.toMatchObject({ code: 'ARTWORK_NOT_PURCHASABLE' })
  })

  it('throws VARIANT_OPTION_UNAVAILABLE when variant was removed', async () => {
    const snapshot: CartVariantSnapshot = {
      variant_id:     'v-1',
      variant_type:   'SIZE',
      variant_name:   'Size',
      option_id:      'deleted-opt',
      option_label:   'Small',
      price_modifier: 0,
    }
    const item    = makeCartItemWithArtwork({ id: 'item-1', variant_snapshot: snapshot })
    const artwork = makeArtwork({
      has_variants: true,
      variants:     [makeVariant([makeVariantOption({ id: 'other-opt' })])],
    })
    mockCartRepo.findByUser.mockResolvedValue([item])
    mockArtworkRepo.findPurchasableById.mockResolvedValue(artwork)

    await expect(
      cartService.validateItemsForCheckout('user-1', ['item-1']),
    ).rejects.toMatchObject({ code: 'VARIANT_OPTION_UNAVAILABLE' })
  })

  it('throws INSUFFICIENT_STOCK when stock dropped since add-to-cart', async () => {
    const item    = makeCartItemWithArtwork({ id: 'item-1', quantity: 5 })
    const artwork = makeArtwork({
      artwork_format:   'PHYSICAL',
      physical_details: { available_quantity: 2 } as any,
    })
    mockCartRepo.findByUser.mockResolvedValue([item])
    mockArtworkRepo.findPurchasableById.mockResolvedValue(artwork)

    await expect(
      cartService.validateItemsForCheckout('user-1', ['item-1']),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' })
  })

  it('returns validated items with effective_price computed server-side', async () => {
    const item    = makeCartItemWithArtwork({ id: 'item-1', quantity: 1, price_at_add: 80 })
    const artwork = makeArtwork({ price: 100 })
    mockCartRepo.findByUser.mockResolvedValue([item])
    mockArtworkRepo.findPurchasableById.mockResolvedValue(artwork)

    const result = await cartService.validateItemsForCheckout('user-1', ['item-1'])

    expect(result).toHaveLength(1)
    expect(result[0]!.effective_price).toBe(100)
    // Price changed flag is set — order service can warn the buyer
    expect(result[0]!.is_price_changed).toBe(true)
  })

  it('sets is_price_changed=false when price is unchanged', async () => {
    const item    = makeCartItemWithArtwork({ id: 'item-1', price_at_add: 100 })
    const artwork = makeArtwork({ price: 100 })
    mockCartRepo.findByUser.mockResolvedValue([item])
    mockArtworkRepo.findPurchasableById.mockResolvedValue(artwork)

    const result = await cartService.validateItemsForCheckout('user-1', ['item-1'])

    expect(result[0]!.is_price_changed).toBe(false)
  })
})