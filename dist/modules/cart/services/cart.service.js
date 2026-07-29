"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cartService = void 0;
const cart_repository_1 = require("../repositories/cart.repository");
const artwork_repository_1 = require("../../../modules/artwork/repositories/artwork.repository");
const artwork_service_1 = require("../../../modules/artwork/services/artwork.service");
const redis_client_1 = require("../../../modules/redis/redis.client");
const errors_1 = require("../../../common/errors");
// ── Constants ─────────────────────────────────────────────────────────────────
const MAX_CART_ITEMS = 50;
const DIGITAL_MAX_QTY = 1;
// ── Cache helpers ─────────────────────────────────────────────────────────────
function invalidateCartCache(userId) {
    void (0, redis_client_1.redisDel)(redis_client_1.RedisKeys.cart(userId));
}
// ── Variant resolution ────────────────────────────────────────────────────────
// Finds a specific option by ID across all variant groups on an artwork.
// Returns undefined if the option does not exist or is unavailable.
function resolveVariantOption(artwork, optionId) {
    for (const variant of artwork.variants) {
        const option = variant.options.find(o => o.id === optionId);
        if (option)
            return { variant, option };
    }
    return undefined;
}
// ── Effective price ───────────────────────────────────────────────────────────
// Base price + variant price_modifier. Always derived from the artwork,
// never from client input.
function computeEffectivePrice(artwork, option) {
    const base = artwork.price ?? 0;
    const modifier = option?.price_modifier ?? 0;
    return Math.max(0, base + modifier);
}
// ── Stock availability check ──────────────────────────────────────────────────
// Returns true when the requested quantity is satisfiable.
// null stock on VariantOption means unlimited.
function isStockSufficient(artwork, option, quantity) {
    if (artwork.artwork_format === 'PHYSICAL') {
        const available = artwork.physical_details?.available_quantity ?? 0;
        if (available < quantity)
            return false;
    }
    if (option?.stock !== null && option?.stock !== undefined) {
        if (option.stock < quantity)
            return false;
    }
    return true;
}
// ── Staleness computation ─────────────────────────────────────────────────────
// Runs against each enriched cart item to set the three staleness flags.
// Called every time the cart is fetched — we never store these in the DB.
function computeStaleness(item) {
    const { artwork, variant_snapshot } = item;
    const isUnavailable = artwork.listing_type !== 'MARKETPLACE' ||
        artwork.status !== 'PUBLISHED' ||
        artwork.moderation_status !== 'APPROVED';
    let currentPrice = artwork.price ?? 0;
    let optionForStock = null;
    if (variant_snapshot) {
        // Re-resolve the option from live artwork data to detect removal/price changes
        const resolved = artwork.has_variants
            ? artwork.variants?.flatMap((v) => v.options).find((o) => o.id === variant_snapshot.option_id) ?? null
            : null;
        if (!resolved || !resolved.is_available) {
            // Variant option was removed or disabled
            return { ...item, is_unavailable: true, is_price_changed: false, is_stock_insufficient: false };
        }
        optionForStock = resolved;
        currentPrice = computeEffectivePrice(artwork, resolved);
    }
    const isPriceChanged = currentPrice !== item.price_at_add;
    const isStockInsufficient = !isUnavailable && !isStockSufficient(artwork, optionForStock, item.quantity);
    return {
        ...item,
        is_unavailable: isUnavailable,
        is_price_changed: isPriceChanged,
        is_stock_insufficient: isStockInsufficient,
    };
}
// ── buildCartSummary ──────────────────────────────────────────────────────────
// Derives the Cart aggregate from enriched items.
// Subtotal uses price_at_add (what the buyer expects to pay).
// The checkout service will re-validate and use current prices.
function buildCartSummary(items) {
    const subtotal = items.reduce((sum, item) => sum + item.price_at_add * item.quantity, 0);
    const hasStaleItems = items.some(i => i.is_price_changed || i.is_unavailable || i.is_stock_insufficient);
    return {
        items,
        item_count: items.length,
        subtotal: Math.round(subtotal * 100) / 100,
        currency: items[0]?.currency_at_add ?? 'USDT',
        has_stale_items: hasStaleItems,
    };
}
// ── Service ───────────────────────────────────────────────────────────────────
exports.cartService = {
    // ── getCart ───────────────────────────────────────────────────────────────
    // Returns the full cart with live staleness flags.
    // Cache is on the raw items array. Staleness is always recomputed on read
    // so a moderation action or price change is reflected immediately.
    async getCart(userId) {
        const cached = await (0, redis_client_1.redisGetJson)(redis_client_1.RedisKeys.cart(userId));
        let items;
        if (cached) {
            items = cached;
        }
        else {
            items = await cart_repository_1.cartRepository.findByUser(userId);
            void (0, redis_client_1.redisSetJson)(redis_client_1.RedisKeys.cart(userId), items, redis_client_1.RedisTTL.cart);
        }
        const itemsWithStaleness = items.map(computeStaleness);
        return buildCartSummary(itemsWithStaleness);
    },
    // ── addItem ───────────────────────────────────────────────────────────────
    async addItem(userId, input) {
        // 1. Fetch artwork and enforce purchasability — single source of truth
        const artwork = await artwork_repository_1.artworkRepository.findPurchasableById(input.artwork_id);
        if (!artwork) {
            throw new errors_1.AppError('Artwork is not available for purchase', 404, 'ARTWORK_NOT_PURCHASABLE');
        }
        (0, artwork_service_1.enforceIsPurchasable)(artwork);
        // 2. Variant resolution
        let resolvedOption = null;
        let variantSnapshot = null;
        if (artwork.has_variants) {
            if (!input.variant_option_id) {
                throw new errors_1.ValidationError('Validation failed', {
                    variant_option_id: 'A variant option must be selected for this artwork',
                });
            }
            const resolved = resolveVariantOption(artwork, input.variant_option_id);
            if (!resolved) {
                throw new errors_1.AppError('The selected variant option does not exist', 422, 'VARIANT_OPTION_NOT_FOUND');
            }
            if (!resolved.option.is_available) {
                throw new errors_1.AppError('The selected variant option is not currently available', 422, 'VARIANT_OPTION_UNAVAILABLE');
            }
            resolvedOption = resolved.option;
            variantSnapshot = {
                variant_id: resolved.variant.id,
                variant_type: resolved.variant.type,
                variant_name: resolved.variant.name,
                option_id: resolved.option.id,
                option_label: resolved.option.label,
                price_modifier: resolved.option.price_modifier,
            };
        }
        else if (input.variant_option_id) {
            // Caller passed a variant option for an artwork that has no variants
            throw new errors_1.ValidationError('Validation failed', {
                variant_option_id: 'This artwork does not have variants',
            });
        }
        // 3. Digital artwork — enforce max qty 1 and prevent re-purchase
        if (artwork.artwork_format === 'DIGITAL') {
            if (input.quantity !== 1) {
                throw new errors_1.ValidationError('Validation failed', {
                    quantity: 'Digital artworks can only be purchased once (quantity must be 1)',
                });
            }
            const existing = await cart_repository_1.cartRepository.findExistingLine(userId, artwork.id, variantSnapshot?.option_id ?? null);
            if (existing) {
                throw new errors_1.AppError('This digital artwork is already in your cart', 409, 'DIGITAL_ALREADY_IN_CART');
            }
        }
        // 4. Quantity bounds
        const maxAllowed = artwork.max_purchase_quantity ?? 100;
        if (input.quantity < 1 || input.quantity > maxAllowed) {
            throw new errors_1.ValidationError('Validation failed', {
                quantity: `Quantity must be between 1 and ${maxAllowed}`,
            });
        }
        // 5. Stock check — advisory, Postgres RPC enforces atomically at checkout
        if (!isStockSufficient(artwork, resolvedOption, input.quantity)) {
            throw new errors_1.AppError('Insufficient stock for the requested quantity', 422, 'INSUFFICIENT_STOCK');
        }
        // 6. Cart size cap
        const currentCount = await cart_repository_1.cartRepository.countByUser(userId);
        if (currentCount >= MAX_CART_ITEMS) {
            throw new errors_1.AppError(`Cart cannot exceed ${MAX_CART_ITEMS} items`, 422, 'CART_LIMIT_REACHED');
        }
        // 7. Compute price snapshot
        const effectivePrice = computeEffectivePrice(artwork, resolvedOption);
        // 8. Persist
        await cart_repository_1.cartRepository.insert({
            user_id: userId,
            artwork_id: artwork.id,
            quantity: input.quantity,
            price_at_add: effectivePrice,
            currency_at_add: artwork.currency,
            variant_snapshot: variantSnapshot,
        });
        invalidateCartCache(userId);
        return this.getCart(userId);
    },
    // ── updateQuantity ────────────────────────────────────────────────────────
    async updateQuantity(userId, itemId, input) {
        const item = await cart_repository_1.cartRepository.findItemById(itemId, userId);
        if (!item)
            throw new errors_1.NotFoundError('Cart item');
        // Fetch live artwork to validate the new quantity against current constraints
        const artwork = await artwork_repository_1.artworkRepository.findById(item.artwork_id);
        if (!artwork) {
            // Artwork was deleted — remove the stale cart row silently
            await cart_repository_1.cartRepository.deleteItem(itemId, userId);
            invalidateCartCache(userId);
            return this.getCart(userId);
        }
        if (artwork.artwork_format === 'DIGITAL') {
            throw new errors_1.AppError('Quantity cannot be changed for digital artworks', 422, 'DIGITAL_QUANTITY_IMMUTABLE');
        }
        if (input.quantity < 1) {
            throw new errors_1.ValidationError('Validation failed', {
                quantity: 'Quantity must be at least 1. To remove an item, use the remove endpoint.',
            });
        }
        const maxAllowed = artwork.max_purchase_quantity ?? 100;
        if (input.quantity > maxAllowed) {
            throw new errors_1.ValidationError('Validation failed', {
                quantity: `Quantity cannot exceed ${maxAllowed} for this artwork`,
            });
        }
        // Resolve variant option for stock check if applicable
        let option = null;
        if (item.variant_snapshot) {
            const resolved = resolveVariantOption(artwork, item.variant_snapshot.option_id);
            option = resolved?.option ?? null;
        }
        if (!isStockSufficient(artwork, option, input.quantity)) {
            throw new errors_1.AppError('Insufficient stock for the requested quantity', 422, 'INSUFFICIENT_STOCK');
        }
        await cart_repository_1.cartRepository.updateQuantity(itemId, userId, input.quantity);
        invalidateCartCache(userId);
        return this.getCart(userId);
    },
    // ── removeItem ────────────────────────────────────────────────────────────
    async removeItem(userId, itemId) {
        const item = await cart_repository_1.cartRepository.findItemById(itemId, userId);
        if (!item)
            throw new errors_1.NotFoundError('Cart item');
        await cart_repository_1.cartRepository.deleteItem(itemId, userId);
        invalidateCartCache(userId);
        return this.getCart(userId);
    },
    // ── clearCart ─────────────────────────────────────────────────────────────
    async clearCart(userId) {
        await cart_repository_1.cartRepository.clearCart(userId);
        invalidateCartCache(userId);
    },
    // ── validateItemsForCheckout ──────────────────────────────────────────────
    // Called by the order service before creating an order. Re-validates each
    // selected item against live artwork data. Returns validated items with
    // their current effective prices — the order service uses these for
    // server-side total calculation. Never trusts client-provided prices.
    async validateItemsForCheckout(userId, cartItemIds) {
        if (!cartItemIds.length) {
            throw new errors_1.ValidationError('Validation failed', {
                cart_item_ids: 'At least one cart item must be selected for checkout',
            });
        }
        const allItems = await cart_repository_1.cartRepository.findByUser(userId);
        const selectedItems = allItems.filter(item => cartItemIds.includes(item.id));
        if (selectedItems.length !== cartItemIds.length) {
            throw new errors_1.AppError('One or more cart items were not found', 422, 'CART_ITEMS_NOT_FOUND');
        }
        const validated = [];
        for (const item of selectedItems) {
            // Re-fetch live artwork for each item — this is intentionally not cached
            // because the checkout path requires the freshest data
            const artwork = await artwork_repository_1.artworkRepository.findPurchasableById(item.artwork_id);
            if (!artwork) {
                throw new errors_1.AppError(`Artwork "${item.artwork.title}" is no longer available for purchase`, 422, 'ARTWORK_NOT_PURCHASABLE');
            }
            (0, artwork_service_1.enforceIsPurchasable)(artwork);
            // Re-resolve variant
            let option = null;
            if (item.variant_snapshot) {
                const resolved = resolveVariantOption(artwork, item.variant_snapshot.option_id);
                if (!resolved || !resolved.option.is_available) {
                    throw new errors_1.AppError(`The selected variant for "${artwork.title}" is no longer available`, 422, 'VARIANT_OPTION_UNAVAILABLE');
                }
                option = resolved.option;
            }
            // Stock check
            if (!isStockSufficient(artwork, option, item.quantity)) {
                throw new errors_1.AppError(`Insufficient stock for "${artwork.title}"`, 422, 'INSUFFICIENT_STOCK');
            }
            const effectivePrice = computeEffectivePrice(artwork, option);
            validated.push({
                ...item,
                artwork: {
                    ...item.artwork,
                    price: artwork.price,
                    currency: artwork.currency,
                },
                effective_price: effectivePrice,
                is_price_changed: effectivePrice !== item.price_at_add,
                is_unavailable: false,
                is_stock_insufficient: false,
            });
        }
        return validated;
    },
};
//# sourceMappingURL=cart.service.js.map