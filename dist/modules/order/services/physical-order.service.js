"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.physicalOrderService = void 0;
const redis_client_1 = require("../../../modules/redis/redis.client");
const physical_order_repository_1 = require("../repositories/physical-order.repository");
const invoice_service_1 = require("./invoice.service");
const order_confirmation_timeout_job_1 = require("../jobs/order-confirmation-timeout.job");
const commerce_types_1 = require("../../../common/types/commerce.types");
const errors_1 = require("../../../common/errors");
const order_repository_1 = require("../repositories/order.repository");
const config_1 = require("../../../config");
// ── Redis distributed lock ────────────────────────────────────────────────────
async function acquireLock(key, ttlSeconds = 10) {
    const redis = (0, redis_client_1.getRedis)();
    const result = await redis.set(key, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
}
async function releaseLock(key) {
    await (0, redis_client_1.getRedis)().del(key);
}
// ── Notification helper ───────────────────────────────────────────────────────
// Uses the real notificationService.create() signature:
//   recipientId, actorId, type, entityId, entityType, data
async function notify(input) {
    try {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore — dynamic import resolved at runtime via moduleNameMapper
        const { notificationService } = await import('../../../modules/messaging/services/notification.service');
        await Promise.all(input.recipientIds.map(id => notificationService.create({
            recipientId: id,
            actorId: null,
            type: input.type,
            entityId: input.orderId ?? null,
            entityType: 'order',
            data: { body: input.body, ...input.metadata },
        })));
    }
    catch (err) {
        console.error('[physicalOrderService] notification failed:', err);
    }
}
// ── Role guard ────────────────────────────────────────────────────────────────
function assertRole(actualRole, allowedRoles) {
    if (!allowedRoles.includes(actualRole)) {
        throw new errors_1.ForbiddenError('Insufficient permissions for this operation');
    }
}
// ── Transition guard ──────────────────────────────────────────────────────────
function assertValidTransition(currentStatus, nextStatus) {
    const allowed = commerce_types_1.PHYSICAL_TRANSITIONS[currentStatus] ?? [];
    if (!allowed.includes(nextStatus)) {
        throw new errors_1.ValidationError(`Invalid transition: cannot move from ${currentStatus} to ${nextStatus}`);
    }
}
// ── Supabase direct reads (avoid circular import from database config) ─────────
async function getOrderBuyerIdDirect(orderId) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — dynamic import resolved at runtime; path verified in tests
    const { supabase } = await import('../../../config/database');
    const result = await supabase()
        .from('orders')
        .select('buyer_id')
        .eq('id', orderId)
        .single();
    return result.data?.['buyer_id'] ?? null;
}
async function getOrderItemSellerIdDirect(orderItemId) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — dynamic import resolved at runtime; path verified in tests
    const { supabase } = await import('../../../config/database');
    const result = await supabase()
        .from('order_items')
        .select('seller_id')
        .eq('id', orderItemId)
        .single();
    return result.data?.['seller_id'] ?? null;
}
// ── Service ───────────────────────────────────────────────────────────────────
exports.physicalOrderService = {
    // ── initPhysicalPipeline ───────────────────────────────────────────────────
    // Called by order.service.ts after payment confirmed for PHYSICAL items.
    // Grouped per seller so each artist gets their own pipeline row set.
    // NOTE: order.service.ts invokes this once per distinct seller on a
    // multi-artist order. The receipt (one per order, not per seller) is
    // guarded with a Redis NX lock so only the first caller generates it.
    async initPhysicalPipeline(input) {
        const orderNumber = await physical_order_repository_1.physicalOrderRepository.assignOrderNumber(input.orderId);
        const created = await physical_order_repository_1.physicalOrderRepository.createPhysicalItems(input.items.map(i => ({
            order_item_id: i.orderItemId,
            order_id: input.orderId,
        })));
        await Promise.all(created.map(p => (0, order_confirmation_timeout_job_1.scheduleConfirmationTimeout)(p.id, input.orderId)));
        const meta = { order_id: input.orderId, order_number: orderNumber };
        await notify({
            recipientIds: [input.buyerId],
            type: 'order_update',
            body: `Your order ${orderNumber} has been placed and is awaiting artist confirmation.`,
            metadata: meta,
            orderId: input.orderId,
        });
        await notify({
            recipientIds: [input.sellerId],
            type: 'order_update',
            body: `You have a new order ${orderNumber}. Please confirm within 14 days.`,
            metadata: meta,
            orderId: input.orderId,
        });
        exports.physicalOrderService
            .generateInvoice({
            orderId: input.orderId,
            orderNumber,
            buyerId: input.buyerId,
            sellerId: input.sellerId,
            generatedBy: input.generatedBy,
            trigger: 'order_created',
        })
            .catch(err => console.error('[physicalOrderService] initial invoice failed:', err));
        // Receipt is one-per-order, not one-per-seller. Use a short-lived NX
        // lock so concurrent seller-group calls don't race to generate duplicate
        // PDFs (the repository layer is also idempotent, but the lock avoids
        // wasted PDFKit + Cloudinary work).
        const receiptLockKey = `order:receipt:lock:${input.orderId}`;
        const shouldGenerate = await acquireLock(receiptLockKey, 30);
        if (shouldGenerate) {
            exports.physicalOrderService
                .generateReceipt({
                orderId: input.orderId,
                orderNumber,
                buyerId: input.buyerId,
                generatedBy: input.generatedBy,
            })
                .catch(err => console.error('[physicalOrderService] receipt generation failed:', err));
        }
    },
    // ── artistConfirm ──────────────────────────────────────────────────────────
    async artistConfirm(input) {
        assertRole(input.actorRole, ['ARTIST', 'ADMIN']);
        const physical = await physical_order_repository_1.physicalOrderRepository.findByOrderItemId(input.physicalId);
        if (!physical)
            throw new errors_1.NotFoundError('Physical order item');
        if (input.actorRole === 'ARTIST') {
            const sellerId = await getOrderItemSellerIdDirect(physical.order_item_id);
            if (sellerId !== input.actorId)
                throw new errors_1.ForbiddenError('You are not the seller of this item');
        }
        assertValidTransition(physical.timeline_status, 'AWAITING_CONFIRMATION_ACTIVE');
        await physical_order_repository_1.physicalOrderRepository.transitionStatus({
            physicalId: physical.id,
            newStatus: 'AWAITING_CONFIRMATION_ACTIVE',
            isPending: false,
            actorId: input.actorId,
            actorRole: input.actorRole === 'ADMIN' ? 'admin' : 'artist',
            notes: 'Artist confirmed the order',
            metadata: {},
        });
        await (0, order_confirmation_timeout_job_1.cancelConfirmationTimeout)(physical.id);
        const { physical: awaiting } = await physical_order_repository_1.physicalOrderRepository.transitionStatus({
            physicalId: physical.id,
            newStatus: 'AWAITING_PICKUP',
            isPending: true,
            actorId: input.actorId,
            actorRole: input.actorRole === 'ADMIN' ? 'admin' : 'artist',
            notes: 'Awaiting admin to assign courier and activate pickup',
            metadata: {},
        });
        const orderNumber = await physical_order_repository_1.physicalOrderRepository.getOrderNumber(physical.order_id);
        const buyerId = await getOrderBuyerIdDirect(physical.order_id);
        if (buyerId) {
            await notify({
                recipientIds: [buyerId],
                type: 'order_update',
                body: `Order ${orderNumber ?? physical.order_id} confirmed by the artist and is awaiting pickup.`,
                metadata: { order_id: physical.order_id, order_number: orderNumber },
                orderId: physical.order_id,
            });
        }
        return awaiting;
    },
    // ── adminActivatePickup ────────────────────────────────────────────────────
    async adminActivatePickup(input) {
        assertRole(input.actorRole, ['ADMIN']);
        const physical = await physical_order_repository_1.physicalOrderRepository.findByOrderItemId(input.physicalId);
        if (!physical)
            throw new errors_1.NotFoundError('Physical order item');
        assertValidTransition(physical.timeline_status, 'AWAITING_PICKUP_ACTIVE');
        const courierPatch = {
            courier_name: input.courier_name,
            courier_service_type: input.courier_service_type,
            shipping_cost: input.shipping_cost,
            pickup_address: input.pickup_address,
        };
        if (input.estimated_delivery_date !== undefined) {
            courierPatch.estimated_delivery_date = input.estimated_delivery_date;
        }
        await physical_order_repository_1.physicalOrderRepository.updateCourierInfo(physical.id, courierPatch);
        const { physical: updated } = await physical_order_repository_1.physicalOrderRepository.transitionStatus({
            physicalId: physical.id,
            newStatus: 'AWAITING_PICKUP_ACTIVE',
            isPending: false,
            actorId: input.actorId,
            actorRole: 'admin',
            notes: `Pickup activated. Courier: ${input.courier_name} (${input.courier_service_type})`,
            metadata: {
                courier_name: input.courier_name,
                courier_service_type: input.courier_service_type,
                shipping_cost: input.shipping_cost,
            },
        });
        const orderNumber = await physical_order_repository_1.physicalOrderRepository.getOrderNumber(physical.order_id);
        const [buyerId, sellerId] = await Promise.all([
            getOrderBuyerIdDirect(physical.order_id),
            getOrderItemSellerIdDirect(physical.order_item_id),
        ]);
        const recipientIds = [buyerId, sellerId].filter((id) => id !== null);
        await notify({
            recipientIds,
            type: 'order_update',
            body: `Order ${orderNumber ?? physical.order_id} pickup scheduled with ${input.courier_name}.`,
            metadata: { order_id: physical.order_id, order_number: orderNumber },
            orderId: physical.order_id,
        });
        return updated;
    },
    // ── adminMarkPickedUp ──────────────────────────────────────────────────────
    async adminMarkPickedUp(input) {
        assertRole(input.actorRole, ['ADMIN']);
        return this._adminSimpleTransition({
            physicalId: input.physicalId,
            actorId: input.actorId,
            newStatus: 'PICKED_UP_ACTIVE',
            eventNotes: input.notes ?? 'Package picked up by courier',
        });
    },
    // ── adminMarkInTransit ─────────────────────────────────────────────────────
    async adminMarkInTransit(input) {
        assertRole(input.actorRole, ['ADMIN']);
        const physical = await physical_order_repository_1.physicalOrderRepository.findByOrderItemId(input.physicalId);
        if (!physical)
            throw new errors_1.NotFoundError('Physical order item');
        assertValidTransition(physical.timeline_status, 'IN_TRANSIT_ACTIVE');
        if (input.tracking_id !== undefined) {
            await physical_order_repository_1.physicalOrderRepository.updateCourierInfo(physical.id, { tracking_id: input.tracking_id });
        }
        const { physical: updated } = await physical_order_repository_1.physicalOrderRepository.transitionStatus({
            physicalId: physical.id,
            newStatus: 'IN_TRANSIT_ACTIVE',
            isPending: false,
            actorId: input.actorId,
            actorRole: 'admin',
            notes: input.notes ?? 'Package is now in transit',
            metadata: input.tracking_id !== undefined ? { tracking_id: input.tracking_id } : {},
        });
        const orderNumber = await physical_order_repository_1.physicalOrderRepository.getOrderNumber(physical.order_id);
        const buyerId = await getOrderBuyerIdDirect(physical.order_id);
        if (buyerId) {
            await notify({
                recipientIds: [buyerId],
                type: 'order_update',
                body: `Order ${orderNumber ?? physical.order_id} is on its way.${input.tracking_id ? ` Tracking: ${input.tracking_id}` : ''}`,
                metadata: { order_id: physical.order_id, order_number: orderNumber },
                orderId: physical.order_id,
            });
        }
        return updated;
    },
    // ── adminMarkOutForDelivery ────────────────────────────────────────────────
    async adminMarkOutForDelivery(input) {
        assertRole(input.actorRole, ['ADMIN']);
        const physical = await physical_order_repository_1.physicalOrderRepository.findByOrderItemId(input.physicalId);
        if (!physical)
            throw new errors_1.NotFoundError('Physical order item');
        assertValidTransition(physical.timeline_status, 'OUT_FOR_DELIVERY_ACTIVE');
        const { physical: updated } = await physical_order_repository_1.physicalOrderRepository.transitionStatus({
            physicalId: physical.id,
            newStatus: 'OUT_FOR_DELIVERY_ACTIVE',
            isPending: false,
            actorId: input.actorId,
            actorRole: 'admin',
            notes: input.notes ?? 'Package is out for delivery',
            metadata: {},
        });
        const orderNumber = await physical_order_repository_1.physicalOrderRepository.getOrderNumber(physical.order_id);
        const buyerId = await getOrderBuyerIdDirect(physical.order_id);
        if (buyerId) {
            await notify({
                recipientIds: [buyerId],
                type: 'order_update',
                body: `Order ${orderNumber ?? physical.order_id} is out for delivery today!`,
                metadata: { order_id: physical.order_id, order_number: orderNumber },
                orderId: physical.order_id,
            });
        }
        return updated;
    },
    // ── adminMarkDelivered ─────────────────────────────────────────────────────
    async adminMarkDelivered(input) {
        assertRole(input.actorRole, ['ADMIN']);
        const physical = await physical_order_repository_1.physicalOrderRepository.findByOrderItemId(input.physicalId);
        if (!physical)
            throw new errors_1.NotFoundError('Physical order item');
        assertValidTransition(physical.timeline_status, 'DELIVERED');
        const { physical: updated } = await physical_order_repository_1.physicalOrderRepository.transitionStatus({
            physicalId: physical.id,
            newStatus: 'DELIVERED',
            isPending: false,
            actorId: input.actorId,
            actorRole: 'admin',
            notes: input.notes ?? 'Package delivered successfully',
            metadata: {},
        });
        // Move this item's sale credit out of PENDING_DELIVERY and into a
        // time-boxed hold — it becomes withdrawable once the hold period
        // elapses (see get_artist_balance_summary / config.wallet.holdPeriodDays).
        // Never blocks the delivery confirmation itself.
        try {
            await order_repository_1.orderRepository.transitionDeliveryHold(physical.order_item_id, config_1.config.wallet.holdPeriodDays);
        }
        catch (err) {
            console.error('[physicalOrderService] transitionDeliveryHold failed:', err);
        }
        const orderNumber = await physical_order_repository_1.physicalOrderRepository.getOrderNumber(physical.order_id);
        const [buyerId, sellerId] = await Promise.all([
            getOrderBuyerIdDirect(physical.order_id),
            getOrderItemSellerIdDirect(physical.order_item_id),
        ]);
        const recipientIds = [buyerId, sellerId].filter((id) => id !== null);
        await notify({
            recipientIds,
            type: 'order_update',
            body: `Order ${orderNumber ?? physical.order_id} has been delivered successfully.`,
            metadata: { order_id: physical.order_id, order_number: orderNumber },
            orderId: physical.order_id,
        });
        return updated;
    },
    // ── adminMarkDeliveryFailed ────────────────────────────────────────────────
    async adminMarkDeliveryFailed(input) {
        assertRole(input.actorRole, ['ADMIN']);
        const physical = await physical_order_repository_1.physicalOrderRepository.findByOrderItemId(input.physicalId);
        if (!physical)
            throw new errors_1.NotFoundError('Physical order item');
        assertValidTransition(physical.timeline_status, 'DELIVERY_FAILED');
        const { physical: updated } = await physical_order_repository_1.physicalOrderRepository.transitionStatus({
            physicalId: physical.id,
            newStatus: 'DELIVERY_FAILED',
            isPending: false,
            actorId: input.actorId,
            actorRole: 'admin',
            notes: input.notes,
            metadata: {},
        });
        const orderNumber = await physical_order_repository_1.physicalOrderRepository.getOrderNumber(physical.order_id);
        const [buyerId, sellerId, adminIds] = await Promise.all([
            getOrderBuyerIdDirect(physical.order_id),
            getOrderItemSellerIdDirect(physical.order_item_id),
            physical_order_repository_1.physicalOrderRepository.findAllAdminIds(),
        ]);
        const meta = { order_id: physical.order_id, order_number: orderNumber };
        const buyerSeller = [buyerId, sellerId].filter((id) => id !== null);
        await notify({ recipientIds: buyerSeller, type: 'order_update', body: `Order ${orderNumber ?? physical.order_id} could not be delivered. Our team is looking into it.`, metadata: meta, orderId: physical.order_id });
        await notify({ recipientIds: adminIds, type: 'order_update', body: `Order ${orderNumber ?? physical.order_id} has a delivery failure. Please review.`, metadata: meta, orderId: physical.order_id });
        return updated;
    },
    // ── adminMarkDelayed ───────────────────────────────────────────────────────
    async adminMarkDelayed(input) {
        assertRole(input.actorRole, ['ADMIN']);
        const physical = await physical_order_repository_1.physicalOrderRepository.findByOrderItemId(input.physicalId);
        if (!physical)
            throw new errors_1.NotFoundError('Physical order item');
        assertValidTransition(physical.timeline_status, 'DELAYED_DELIVERY');
        const { physical: updated } = await physical_order_repository_1.physicalOrderRepository.transitionStatus({
            physicalId: physical.id,
            newStatus: 'DELAYED_DELIVERY',
            isPending: false,
            actorId: input.actorId,
            actorRole: 'admin',
            notes: input.notes,
            metadata: {},
        });
        const orderNumber = await physical_order_repository_1.physicalOrderRepository.getOrderNumber(physical.order_id);
        const [buyerId, sellerId] = await Promise.all([
            getOrderBuyerIdDirect(physical.order_id),
            getOrderItemSellerIdDirect(physical.order_item_id),
        ]);
        const recipientIds = [buyerId, sellerId].filter((id) => id !== null);
        await notify({
            recipientIds,
            type: 'order_update',
            body: `Order ${orderNumber ?? physical.order_id} has experienced a delivery delay. ${input.notes}`,
            metadata: { order_id: physical.order_id, order_number: orderNumber },
            orderId: physical.order_id,
        });
        return updated;
    },
    // ── adminHandlePickupFailure ───────────────────────────────────────────────
    async adminHandlePickupFailure(input) {
        assertRole(input.actorRole, ['ADMIN']);
        const physical = await physical_order_repository_1.physicalOrderRepository.findByOrderItemId(input.physicalId);
        if (!physical)
            throw new errors_1.NotFoundError('Physical order item');
        assertValidTransition(physical.timeline_status, input.reason);
        const { physical: updated } = await physical_order_repository_1.physicalOrderRepository.transitionStatus({
            physicalId: physical.id,
            newStatus: input.reason,
            isPending: false,
            actorId: input.actorId,
            actorRole: 'admin',
            notes: input.notes,
            metadata: { failure_reason: input.reason },
        });
        return updated;
    },
    // ── updateCourierInfo ──────────────────────────────────────────────────────
    async updateCourierInfo(input) {
        assertRole(input.actorRole, ['ADMIN']);
        const physical = await physical_order_repository_1.physicalOrderRepository.findByOrderItemId(input.physicalId);
        if (!physical)
            throw new errors_1.NotFoundError('Physical order item');
        if (physical.delivery_status === 'DELIVERED' || physical.delivery_status === 'CANCELLED') {
            throw new errors_1.ValidationError('Cannot update courier info on a completed or cancelled item');
        }
        const patch = {};
        if (input.courier_name !== undefined)
            patch.courier_name = input.courier_name;
        if (input.courier_service_type !== undefined)
            patch.courier_service_type = input.courier_service_type;
        if (input.tracking_id !== undefined)
            patch.tracking_id = input.tracking_id;
        if (input.shipping_cost !== undefined)
            patch.shipping_cost = input.shipping_cost;
        if (input.estimated_delivery_date !== undefined)
            patch.estimated_delivery_date = input.estimated_delivery_date;
        if (input.pickup_address !== undefined)
            patch.pickup_address = input.pickup_address;
        return physical_order_repository_1.physicalOrderRepository.updateCourierInfo(physical.id, patch);
    },
    // ── cancelItem ────────────────────────────────────────────────────────────
    async cancelItem(input) {
        const lockKey = `order:cancel:lock:${input.physicalId}`;
        const locked = await acquireLock(lockKey, 10);
        if (!locked)
            throw new errors_1.ConflictError('This order item is already being processed. Please try again.');
        try {
            const physical = await physical_order_repository_1.physicalOrderRepository.findByOrderItemId(input.physicalId);
            if (!physical)
                throw new errors_1.NotFoundError('Physical order item');
            if (physical.delivery_status === 'CANCELLED')
                throw new errors_1.ConflictError('This item has already been cancelled');
            if (physical.timeline_status === 'DELIVERED')
                throw new errors_1.ForbiddenError('Cannot cancel a delivered order. Request a refund instead.');
            if (input.actorRole !== 'ADMIN') {
                assertRole(input.actorRole, ['USER', 'ARTIST']);
                if (!commerce_types_1.BUYER_ARTIST_CANCELLABLE_STATES.has(physical.timeline_status)) {
                    throw new errors_1.ForbiddenError('Cancellation is no longer possible at this stage. Contact support.');
                }
                if (input.actorRole === 'ARTIST') {
                    const sellerId = await getOrderItemSellerIdDirect(physical.order_item_id);
                    if (sellerId !== input.actorId)
                        throw new errors_1.ForbiddenError('You are not the seller of this item');
                }
                else {
                    const buyerId = await getOrderBuyerIdDirect(physical.order_id);
                    if (buyerId !== input.actorId)
                        throw new errors_1.ForbiddenError('You are not the buyer of this order');
                }
            }
            const actorRole = input.actorRole === 'ADMIN' ? 'admin'
                : input.actorRole === 'ARTIST' ? 'artist'
                    : 'buyer';
            const { physical: cancelled } = await physical_order_repository_1.physicalOrderRepository.transitionStatus({
                physicalId: physical.id,
                newStatus: 'ORDER_FAILED_TO_CONFIRM',
                isPending: false,
                actorId: input.actorId,
                actorRole,
                notes: `Cancelled by ${actorRole}. Reason: ${input.reason}`,
                metadata: { cancelled_by: actorRole, reason: input.reason },
            });
            await (0, order_confirmation_timeout_job_1.cancelConfirmationTimeout)(physical.id);
            const orderNumber = await physical_order_repository_1.physicalOrderRepository.getOrderNumber(physical.order_id);
            const [buyerId, sellerId] = await Promise.all([
                getOrderBuyerIdDirect(physical.order_id),
                getOrderItemSellerIdDirect(physical.order_item_id),
            ]);
            const recipientIds = [buyerId, sellerId].filter((id) => id !== null);
            await notify({
                recipientIds,
                type: 'order_update',
                body: `Order ${orderNumber ?? physical.order_id} has been cancelled. ${input.reason}`,
                metadata: { order_id: physical.order_id, order_number: orderNumber, cancelled_by: actorRole },
                orderId: physical.order_id,
            });
            return cancelled;
        }
        finally {
            await releaseLock(lockKey);
        }
    },
    // ── artistRequestRefund ───────────────────────────────────────────────────
    async artistRequestRefund(input) {
        assertRole(input.actorRole, ['ARTIST']);
        const physical = await physical_order_repository_1.physicalOrderRepository.findByOrderItemId(input.physicalId);
        if (!physical)
            throw new errors_1.NotFoundError('Physical order item');
        const sellerId = await getOrderItemSellerIdDirect(physical.order_item_id);
        if (sellerId !== input.actorId)
            throw new errors_1.ForbiddenError('You are not the seller of this item');
        if (physical.refund_status !== 'NONE') {
            throw new errors_1.ConflictError('A refund has already been initiated for this item');
        }
        const request = await physical_order_repository_1.physicalOrderRepository.createRefundRequest({
            order_item_physical_id: physical.id,
            order_id: physical.order_id,
            requested_by: input.actorId,
            reason: input.reason,
        });
        await physical_order_repository_1.physicalOrderRepository.updateRefundState(physical.id, {
            refund_status: 'PENDING',
            refund_initiated_at: new Date(),
        });
        const orderNumber = await physical_order_repository_1.physicalOrderRepository.getOrderNumber(physical.order_id);
        const adminIds = await physical_order_repository_1.physicalOrderRepository.findAllAdminIds();
        await notify({
            recipientIds: adminIds,
            type: 'order_update',
            body: `Artist requested a refund for order ${orderNumber ?? physical.order_id}. Reason: ${input.reason}`,
            metadata: { order_id: physical.order_id, order_number: orderNumber, request_id: request.id },
            orderId: physical.order_id,
        });
        return request;
    },
    // ── adminProcessRefund ─────────────────────────────────────────────────────
    // Admin approves or rejects. On approval: deducts 14% fee from item_cost,
    // writes DEBIT ledger entry for buyer, never refunds shipping.
    async adminProcessRefund(input) {
        assertRole(input.actorRole, ['ADMIN']);
        const allPending = await physical_order_repository_1.physicalOrderRepository.findPendingRefundRequests();
        const request = allPending.find(r => r.id === input.requestId);
        if (!request)
            throw new errors_1.NotFoundError('Refund request');
        const physical = await physical_order_repository_1.physicalOrderRepository.findByOrderItemId(request.order_item_physical_id);
        if (!physical)
            throw new errors_1.NotFoundError('Physical order item');
        const refundRequestPatch = {
            status: input.decision === 'APPROVED' ? 'APPROVED' : 'REJECTED',
            reviewed_by: input.actorId,
        };
        if (input.admin_notes !== undefined)
            refundRequestPatch.admin_notes = input.admin_notes;
        if (input.decision === 'REJECTED') {
            const updatedRequest = await physical_order_repository_1.physicalOrderRepository.updateRefundRequest(request.id, refundRequestPatch);
            await physical_order_repository_1.physicalOrderRepository.updateRefundState(physical.id, { refund_status: 'NONE' });
            const buyerId = await getOrderBuyerIdDirect(physical.order_id);
            if (buyerId) {
                await notify({
                    recipientIds: [buyerId],
                    type: 'order_update',
                    body: `Your refund request for order ${input.order_number ?? physical.order_id} was declined.${input.admin_notes ? ` Note: ${input.admin_notes}` : ''}`,
                    metadata: { order_id: physical.order_id },
                    orderId: physical.order_id,
                });
            }
            return { request: updatedRequest, physical };
        }
        // APPROVED
        if (input.item_cost == null) {
            throw new errors_1.ValidationError('item_cost is required when approving a refund');
        }
        const refundableAmt = input.item_cost - (input.item_cost * commerce_types_1.PLATFORM_SERVICE_FEE_RATE);
        const updatedRequest = await physical_order_repository_1.physicalOrderRepository.updateRefundRequest(request.id, refundRequestPatch);
        let updatedPhysical = await physical_order_repository_1.physicalOrderRepository.updateRefundState(physical.id, {
            refund_status: 'PROCESSING',
            refund_amount: refundableAmt,
            refund_initiated_at: new Date(),
        });
        try {
            const buyerId = await getOrderBuyerIdDirect(physical.order_id);
            if (!buyerId)
                throw new Error('Buyer not found for refund ledger entry');
            const currentBalance = await order_repository_1.orderRepository.getWalletBalance(buyerId);
            await order_repository_1.orderRepository.appendWalletLedgerEntry({
                user_id: buyerId,
                transaction_id: null,
                order_id: physical.order_id,
                order_item_id: physical.order_item_id,
                type: 'CREDIT',
                category: 'REFUND',
                hold_status: 'AVAILABLE',
                amount: refundableAmt,
                balance_after: currentBalance + refundableAmt,
                description: `Refund for order ${input.order_number ?? physical.order_id} (item cost minus ${(commerce_types_1.PLATFORM_SERVICE_FEE_RATE * 100).toFixed(0)}% platform fee; shipping non-refundable)`,
            });
            updatedPhysical = await physical_order_repository_1.physicalOrderRepository.updateRefundState(physical.id, {
                refund_status: 'COMPLETED',
                refund_completed_at: new Date(),
            });
            const orderNumber = await physical_order_repository_1.physicalOrderRepository.getOrderNumber(physical.order_id);
            await notify({
                recipientIds: [buyerId],
                type: 'order_update',
                body: `Your refund of ${refundableAmt.toFixed(2)} USDT for order ${orderNumber ?? physical.order_id} has been processed.`,
                metadata: { order_id: physical.order_id, order_number: orderNumber, refund_amount: refundableAmt },
                orderId: physical.order_id,
            });
            const orderNumber2 = await physical_order_repository_1.physicalOrderRepository.getOrderNumber(physical.order_id);
            exports.physicalOrderService.generateInvoice({
                orderId: physical.order_id,
                orderNumber: orderNumber2 ?? physical.order_id,
                buyerId,
                sellerId: request.requested_by,
                generatedBy: input.actorId,
                trigger: 'refund_processed',
            }).catch(err => console.error('[physicalOrderService] refund invoice failed:', err));
        }
        catch (walletErr) {
            updatedPhysical = await physical_order_repository_1.physicalOrderRepository.updateRefundState(physical.id, {
                refund_status: 'FAILED',
                refund_notes: `Ledger credit failed: ${walletErr.message}`,
            });
            const adminIds = await physical_order_repository_1.physicalOrderRepository.findAllAdminIds();
            await notify({
                recipientIds: adminIds,
                type: 'order_update',
                body: `Refund for order ${physical.order_id} failed at ledger stage. Manual intervention required.`,
                metadata: { order_id: physical.order_id, error: walletErr.message },
                orderId: physical.order_id,
            });
        }
        return { request: updatedRequest, physical: updatedPhysical };
    },
    // ── addDeliveryProof ───────────────────────────────────────────────────────
    async addDeliveryProof(input) {
        assertRole(input.actorRole, ['ADMIN']);
        const physical = await physical_order_repository_1.physicalOrderRepository.findByOrderItemId(input.physicalId);
        if (!physical)
            throw new errors_1.NotFoundError('Physical order item');
        if (physical.timeline_status !== 'DELIVERED') {
            throw new errors_1.ValidationError('Delivery proof can only be uploaded after the item is marked as delivered');
        }
        return physical_order_repository_1.physicalOrderRepository.addDeliveryProof({
            order_item_physical_id: physical.id,
            order_id: physical.order_id,
            cloudinary_public_id: input.cloudinary_public_id,
            secure_url: input.secure_url,
            mime_type: input.mime_type,
            file_size_bytes: input.file_size_bytes,
            uploaded_by: input.actorId,
            uploader_role: 'admin',
        });
    },
    // ── getOrderView ───────────────────────────────────────────────────────────
    async getOrderView(physicalId, requesterId, requesterRole) {
        const physical = await physical_order_repository_1.physicalOrderRepository.findByOrderItemId(physicalId);
        if (!physical)
            throw new errors_1.NotFoundError('Physical order item');
        if (requesterRole === 'USER') {
            const buyerId = await getOrderBuyerIdDirect(physical.order_id);
            if (buyerId !== requesterId)
                throw new errors_1.ForbiddenError('Access denied');
        }
        else if (requesterRole === 'ARTIST') {
            const sellerId = await getOrderItemSellerIdDirect(physical.order_item_id);
            if (sellerId !== requesterId)
                throw new errors_1.ForbiddenError('Access denied');
        }
        const [timeline, delivery_proofs, invoice, receipt, refund_requests, delivery_address, buyerId, sellerId] = await Promise.all([
            physical_order_repository_1.physicalOrderRepository.getTimeline(physical.id),
            physical_order_repository_1.physicalOrderRepository.getDeliveryProofs(physical.id),
            physical_order_repository_1.physicalOrderRepository.getLatestInvoice(physical.order_id),
            physical_order_repository_1.physicalOrderRepository.getReceipt(physical.order_id),
            physical_order_repository_1.physicalOrderRepository.getRefundRequests(physical.order_id),
            physical_order_repository_1.physicalOrderRepository.getShippingAddress(physical.order_id),
            getOrderBuyerIdDirect(physical.order_id),
            getOrderItemSellerIdDirect(physical.order_item_id),
        ]);
        const [buyer, seller] = await Promise.all([
            buyerId ? physical_order_repository_1.physicalOrderRepository.getUserProfile(buyerId) : Promise.resolve(null),
            sellerId ? physical_order_repository_1.physicalOrderRepository.getUserProfile(sellerId) : Promise.resolve(null),
        ]);
        return { physical, timeline, delivery_proofs, invoice, receipt, refund_requests, delivery_address, buyer, seller };
    },
    // ── List helpers ───────────────────────────────────────────────────────────
    // Named presets ("all" | "live" | "delivered" | ...) resolve to the
    // underlying delivery_status/timeline_status filters server-side so the
    // frontend tabs don't need to know the raw enum semantics.
    async listForBuyer(buyerId, view, filters) {
        const resolved = this._resolveBuyerView(view, filters);
        return physical_order_repository_1.physicalOrderRepository.findByBuyerWithItems(buyerId, resolved);
    },
    async listForArtist(sellerId, view, filters) {
        const resolved = await this._resolveArtistView(view, filters);
        if (resolved.__empty) {
            return { data: [], total: 0, page: filters.page ?? 1, limit: filters.limit ?? 20, total_pages: 0, has_next: false, has_prev: false };
        }
        return physical_order_repository_1.physicalOrderRepository.findBySellerWithItems(sellerId, resolved.filters);
    },
    async adminList(filters) {
        return physical_order_repository_1.physicalOrderRepository.findAllAdminList(filters);
    },
    async adminListRefundRequests() {
        return physical_order_repository_1.physicalOrderRepository.findPendingRefundRequests();
    },
    // ── updateShippingAddress ──────────────────────────────────────────────────
    // Admin-only. Buyers cannot edit their own order; only the shipping/
    // delivery address is mutable, and only by an admin, since the address
    // snapshot otherwise stays immutable for invoice/receipt integrity.
    async updateShippingAddress(input) {
        assertRole(input.actorRole, ['ADMIN']);
        const updated = await order_repository_1.orderRepository.updateShippingAddress(input.orderId, {
            full_name: input.address.full_name,
            phone: input.address.phone,
            address_line_1: input.address.address_line_1,
            address_line_2: input.address.address_line_2 ?? null,
            city: input.address.city,
            state: input.address.state,
            postal_code: input.address.postal_code,
            country_code: input.address.country_code,
        });
        if (!updated)
            throw new errors_1.NotFoundError('Order');
        const orderNumber = await physical_order_repository_1.physicalOrderRepository.getOrderNumber(input.orderId);
        const buyerId = updated.buyer_id;
        await notify({
            recipientIds: [buyerId],
            type: 'order_update',
            body: `The delivery address for order ${orderNumber ?? input.orderId} was updated by our team.`,
            metadata: { order_id: input.orderId, order_number: orderNumber },
            orderId: input.orderId,
        });
        return updated;
    },
    // ── generateInvoice ────────────────────────────────────────────────────────
    async generateInvoice(input) {
        try {
            const [buyer, seller, physicals] = await Promise.all([
                physical_order_repository_1.physicalOrderRepository.getUserProfile(input.buyerId),
                physical_order_repository_1.physicalOrderRepository.getUserProfile(input.sellerId),
                physical_order_repository_1.physicalOrderRepository.findByOrderId(input.orderId),
            ]);
            if (!buyer || !seller || !physicals.length)
                return null;
            const items = physicals.map(p => ({
                title: `Physical artwork item`,
                unit_price: 0,
                shipping_cost: p.shipping_cost ?? 0,
                courier_name: p.courier_name,
                service_type: p.courier_service_type,
            }));
            const totalRefund = physicals.reduce((sum, p) => sum + (p.refund_amount ?? 0), 0);
            const refundStatus = physicals[0]?.refund_status ?? 'NONE';
            return invoice_service_1.invoiceService.generate({
                order_id: input.orderId,
                order_number: input.orderNumber,
                purchase_date: new Date(),
                buyer: { id: buyer.id, username: buyer.username },
                seller: { id: seller.id, username: seller.username },
                items,
                currency: 'USDT',
                refund_amount: totalRefund > 0 ? totalRefund : null,
                refund_status: refundStatus,
                generated_by: input.generatedBy,
                trigger: input.trigger,
            });
        }
        catch (err) {
            console.error('[physicalOrderService] generateInvoice error:', err);
            return null;
        }
    },
    // ── generateReceipt ────────────────────────────────────────────────────────
    // One per order — proof of payment, distinct from the itemized invoice.
    // Pulls amount/method/reference from the confirmed transaction.
    async generateReceipt(input) {
        try {
            const [buyer, transaction] = await Promise.all([
                physical_order_repository_1.physicalOrderRepository.getUserProfile(input.buyerId),
                order_repository_1.orderRepository.findTransactionByOrder(input.orderId),
            ]);
            if (!buyer || !transaction)
                return null;
            return invoice_service_1.receiptService.generate({
                order_id: input.orderId,
                order_number: input.orderNumber,
                payment_date: transaction.confirmed_at ?? transaction.created_at,
                buyer: { id: buyer.id, username: buyer.username },
                amount_paid: transaction.amount,
                currency: transaction.currency,
                payment_method: transaction.network,
                transaction_reference: transaction.tx_hash,
                generated_by: input.generatedBy,
            });
        }
        catch (err) {
            console.error('[physicalOrderService] generateReceipt error:', err);
            return null;
        }
    },
    // ── notifyAutoCancel ───────────────────────────────────────────────────────
    async notifyAutoCancel(physicalId, orderId) {
        const physical = await physical_order_repository_1.physicalOrderRepository.findByOrderItemId(physicalId).catch(() => null);
        if (!physical)
            return;
        const orderNumber = await physical_order_repository_1.physicalOrderRepository.getOrderNumber(orderId);
        const [buyerId, sellerId, adminIds] = await Promise.all([
            getOrderBuyerIdDirect(orderId),
            getOrderItemSellerIdDirect(physical.order_item_id),
            physical_order_repository_1.physicalOrderRepository.findAllAdminIds(),
        ]);
        const meta = { order_id: orderId, order_number: orderNumber, auto_cancelled: true };
        const buyerSeller = [buyerId, sellerId].filter((id) => id !== null);
        await Promise.all([
            notify({
                recipientIds: buyerSeller,
                type: 'order_update',
                body: `Order ${orderNumber ?? orderId} was automatically cancelled — artist did not confirm within 14 days.`,
                metadata: meta,
                orderId,
            }),
            notify({
                recipientIds: adminIds,
                type: 'order_update',
                body: `Order ${orderNumber ?? orderId} was auto-cancelled after 14-day confirmation timeout.`,
                metadata: meta,
                orderId,
            }),
        ]);
    },
    // ── Private: simple admin transition ──────────────────────────────────────
    async _adminSimpleTransition(input) {
        const physical = await physical_order_repository_1.physicalOrderRepository.findByOrderItemId(input.physicalId);
        if (!physical)
            throw new errors_1.NotFoundError('Physical order item');
        assertValidTransition(physical.timeline_status, input.newStatus);
        const { physical: updated } = await physical_order_repository_1.physicalOrderRepository.transitionStatus({
            physicalId: physical.id,
            newStatus: input.newStatus,
            isPending: false,
            actorId: input.actorId,
            actorRole: 'admin',
            notes: input.eventNotes,
            metadata: input.metadata ?? {},
        });
        return updated;
    },
    // ── Private: named buyer view resolver ─────────────────────────────────────
    // "all" passes through; "live"/"delivered"/"cancelled" map to delivery_status
    // since that's the buyer-facing grouping already decoupled from the granular
    // timeline_status.
    _resolveBuyerView(view, filters) {
        if (view === 'all')
            return filters;
        const delivery_status = view === 'live' ? 'LIVE' :
            view === 'delivered' ? 'DELIVERED' :
                'CANCELLED';
        return { ...filters, delivery_status };
    },
    // ── Private: named artist view resolver ─────────────────────────────────────
    // "pending" has no single delivery_status/timeline_status equivalent — it
    // spans several pre-confirmation TimelineStatus values — so it cannot be
    // expressed as a single filter field. We resolve it by pre-fetching the
    // matching order_item_physical IDs and intersecting client-side via a
    // dedicated repository call would be wasteful; instead "pending" disables
    // the timeline_status filter the caller may have set and informs the
    // repository layer via an internal flag. Since PhysicalOrderFilters can
    // only carry a single timeline_status, "pending" is handled by issuing one
    // repository call per matching status and merging results in-memory,
    // capped to the requested page size after a combined sort.
    async _resolveArtistView(view, filters) {
        if (view === 'all')
            return { filters };
        if (view === 'live')
            return { filters: { ...filters, delivery_status: 'LIVE' } };
        if (view === 'completed')
            return { filters: { ...filters, delivery_status: 'DELIVERED' } };
        if (view === 'cancelled')
            return { filters: { ...filters, delivery_status: 'CANCELLED' } };
        // view === 'pending' — spans multiple TimelineStatus values
        // (ORDER_RECEIVED / _ACTIVE / AWAITING_CONFIRMATION / _ACTIVE).
        // If the caller also passed a single timeline_status that isn't one of
        // the pending statuses, the intersection is empty.
        if (filters.timeline_status && !commerce_types_1.ARTIST_PENDING_STATUSES.includes(filters.timeline_status)) {
            return { filters, __empty: true };
        }
        return {
            filters: {
                ...filters,
                delivery_status: 'LIVE',
                timeline_status: undefined,
                timeline_status_in: filters.timeline_status
                    ? [filters.timeline_status]
                    : commerce_types_1.ARTIST_PENDING_STATUSES,
            },
        };
    },
};
//# sourceMappingURL=physical-order.service.js.map