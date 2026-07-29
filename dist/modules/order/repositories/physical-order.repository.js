"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.physicalOrderRepository = void 0;
const database_1 = require("../../../config/database");
// ── Row → Domain mappers ──────────────────────────────────────────────────────
function toPhysical(row) {
    return {
        id: row['id'],
        order_item_id: row['order_item_id'],
        order_id: row['order_id'],
        timeline_status: row['timeline_status'],
        delivery_status: row['delivery_status'],
        shipping_cost: row['shipping_cost'] != null ? Number(row['shipping_cost']) : null,
        courier_name: row['courier_name'] ?? null,
        courier_service_type: (row['courier_service_type'] ?? null),
        tracking_id: row['tracking_id'] ?? null,
        estimated_delivery_date: row['estimated_delivery_date'] ? new Date(row['estimated_delivery_date']) : null,
        pickup_address: row['pickup_address'] ?? null,
        refund_status: row['refund_status'],
        refund_amount: row['refund_amount'] != null ? Number(row['refund_amount']) : null,
        refund_initiated_at: row['refund_initiated_at'] ? new Date(row['refund_initiated_at']) : null,
        refund_completed_at: row['refund_completed_at'] ? new Date(row['refund_completed_at']) : null,
        refund_notes: row['refund_notes'] ?? null,
        confirmed_at: row['confirmed_at'] ? new Date(row['confirmed_at']) : null,
        picked_up_at: row['picked_up_at'] ? new Date(row['picked_up_at']) : null,
        in_transit_at: row['in_transit_at'] ? new Date(row['in_transit_at']) : null,
        delivered_at: row['delivered_at'] ? new Date(row['delivered_at']) : null,
        created_at: new Date(row['created_at']),
        updated_at: new Date(row['updated_at']),
    };
}
function toTimelineEvent(row) {
    return {
        id: row['id'],
        order_item_physical_id: row['order_item_physical_id'],
        order_id: row['order_id'],
        order_item_id: row['order_item_id'],
        timeline_status: row['timeline_status'],
        is_pending: row['is_pending'],
        actor_id: row['actor_id'] ?? null,
        actor_role: row['actor_role'],
        notes: row['notes'] ?? null,
        metadata: (row['metadata'] ?? {}),
        occurred_at: new Date(row['occurred_at']),
    };
}
function toDeliveryProof(row) {
    return {
        id: row['id'],
        order_item_physical_id: row['order_item_physical_id'],
        order_id: row['order_id'],
        cloudinary_public_id: row['cloudinary_public_id'],
        secure_url: row['secure_url'],
        mime_type: row['mime_type'],
        file_size_bytes: row['file_size_bytes'],
        uploaded_by: row['uploaded_by'],
        uploader_role: row['uploader_role'],
        uploaded_at: new Date(row['uploaded_at']),
    };
}
function toInvoice(row) {
    return {
        id: row['id'],
        order_id: row['order_id'],
        version: row['version'],
        pdf_cloudinary_public_id: row['pdf_cloudinary_public_id'],
        pdf_url: row['pdf_url'],
        generated_at: new Date(row['generated_at']),
        generated_by: row['generated_by'],
        trigger: row['trigger'],
    };
}
function toReceipt(row) {
    return {
        id: row['id'],
        order_id: row['order_id'],
        pdf_cloudinary_public_id: row['pdf_cloudinary_public_id'],
        pdf_url: row['pdf_url'],
        amount_paid: Number(row['amount_paid']),
        currency: row['currency'],
        payment_method: row['payment_method'],
        transaction_reference: row['transaction_reference'] ?? null,
        generated_at: new Date(row['generated_at']),
        generated_by: row['generated_by'],
    };
}
function toRefundRequest(row) {
    return {
        id: row['id'],
        order_item_physical_id: row['order_item_physical_id'],
        order_id: row['order_id'],
        requested_by: row['requested_by'],
        reason: row['reason'],
        status: row['status'],
        admin_notes: row['admin_notes'] ?? null,
        reviewed_by: row['reviewed_by'] ?? null,
        reviewed_at: row['reviewed_at'] ? new Date(row['reviewed_at']) : null,
        created_at: new Date(row['created_at']),
    };
}
// ── Repository ────────────────────────────────────────────────────────────────
exports.physicalOrderRepository = {
    // ── assignOrderNumber ───────────────────────────────────────────────────────
    // Calls the DB RPC which generates a collision-safe AR-XXXXXXXX number
    // and sets it atomically. Idempotent — safe to call multiple times.
    async assignOrderNumber(orderId) {
        const result = await (0, database_1.supabase)()
            .rpc('assign_order_number', { p_order_id: orderId });
        if (result.error) {
            throw new Error(`[physical:assignOrderNumber] ${result.error.message}`);
        }
        return result.data;
    },
    // ── getOrderNumber ──────────────────────────────────────────────────────────
    async getOrderNumber(orderId) {
        const result = await (0, database_1.supabase)()
            .from('orders')
            .select('order_number')
            .eq('id', orderId)
            .single();
        if (result.error)
            return null;
        return result.data?.['order_number'] ?? null;
    },
    // ── createPhysicalItems ─────────────────────────────────────────────────────
    // Called after payment confirms. One row per physical order_item.
    // Also appends the initial ORDER_RECEIVED timeline event via the RPC.
    async createPhysicalItems(inputs) {
        if (inputs.length === 0)
            return [];
        const rows = inputs.map(i => ({
            order_item_id: i.order_item_id,
            order_id: i.order_id,
            timeline_status: 'ORDER_RECEIVED',
            delivery_status: 'LIVE',
            refund_status: 'NONE',
        }));
        const result = await (0, database_1.supabase)()
            .from('order_item_physical')
            .insert(rows)
            .select('*');
        (0, database_1.assertNoErrorMany)(result, 'physical.createPhysicalItems');
        const created = (result.data ?? []).map(toPhysical);
        // Append initial ORDER_RECEIVED event for each item
        await Promise.all(created.map((item) => this.transitionStatus({
            physicalId: item.id,
            newStatus: 'ORDER_RECEIVED',
            isPending: false,
            actorId: null,
            actorRole: 'system',
            notes: 'Order received after payment confirmed',
            metadata: {},
        })));
        return created;
    },
    // ── transitionStatus ───────────────────────────────────────────────────────
    // Calls the atomic DB RPC that locks the row, updates timeline_status,
    // derives delivery_status, sets milestone timestamps, and appends the
    // timeline event — all in one transaction.
    async transitionStatus(input) {
        const rpcResult = await (0, database_1.supabase)()
            .rpc('transition_item_timeline', {
            p_physical_id: input.physicalId,
            p_new_status: input.newStatus,
            p_is_pending: input.isPending,
            p_actor_id: input.actorId,
            p_actor_role: input.actorRole,
            p_notes: input.notes,
            p_metadata: input.metadata,
        });
        if (rpcResult.error) {
            throw new Error(`[physical:transitionStatus] ${rpcResult.error.message}`);
        }
        const eventId = rpcResult.data;
        // Re-fetch the updated physical row
        const physResult = await (0, database_1.supabase)()
            .from('order_item_physical')
            .select('*')
            .eq('id', input.physicalId)
            .single();
        (0, database_1.assertNoError)(physResult, 'physical.transitionStatus.refetch');
        return { physical: toPhysical(physResult.data), eventId };
    },
    // ── findByOrderItemId ───────────────────────────────────────────────────────
    async findByOrderItemId(orderItemId) {
        const result = await (0, database_1.supabase)()
            .from('order_item_physical')
            .select('*')
            .eq('order_item_id', orderItemId)
            .single();
        if (result.error?.code === 'PGRST116')
            return undefined;
        (0, database_1.assertNoError)(result, 'physical.findByOrderItemId');
        return toPhysical(result.data);
    },
    // ── findByOrderId ───────────────────────────────────────────────────────────
    async findByOrderId(orderId) {
        const result = await (0, database_1.supabase)()
            .from('order_item_physical')
            .select('*')
            .eq('order_id', orderId)
            .order('created_at', { ascending: true });
        (0, database_1.assertNoErrorMany)(result, 'physical.findByOrderId');
        return (result.data ?? []).map(toPhysical);
    },
    // ── updateCourierInfo ───────────────────────────────────────────────────────
    // Admin-only PATCH for courier name, type, and tracking ID.
    async updateCourierInfo(physicalId, patch) {
        const payload = {
            updated_at: new Date().toISOString(),
        };
        if (patch.courier_name !== undefined)
            payload['courier_name'] = patch.courier_name;
        if (patch.courier_service_type !== undefined)
            payload['courier_service_type'] = patch.courier_service_type;
        if (patch.tracking_id !== undefined)
            payload['tracking_id'] = patch.tracking_id;
        if (patch.shipping_cost !== undefined)
            payload['shipping_cost'] = patch.shipping_cost;
        if (patch.estimated_delivery_date !== undefined)
            payload['estimated_delivery_date'] = patch.estimated_delivery_date;
        if (patch.pickup_address !== undefined)
            payload['pickup_address'] = patch.pickup_address;
        const result = await (0, database_1.supabase)()
            .from('order_item_physical')
            .update(payload)
            .eq('id', physicalId)
            .select('*')
            .single();
        (0, database_1.assertNoError)(result, 'physical.updateCourierInfo');
        return toPhysical(result.data);
    },
    // ── updateRefundState ───────────────────────────────────────────────────────
    async updateRefundState(physicalId, patch) {
        const payload = {
            refund_status: patch.refund_status,
            updated_at: new Date().toISOString(),
        };
        if (patch.refund_amount !== undefined)
            payload['refund_amount'] = patch.refund_amount;
        if (patch.refund_initiated_at !== undefined)
            payload['refund_initiated_at'] = patch.refund_initiated_at.toISOString();
        if (patch.refund_completed_at !== undefined)
            payload['refund_completed_at'] = patch.refund_completed_at.toISOString();
        if (patch.refund_notes !== undefined)
            payload['refund_notes'] = patch.refund_notes;
        const result = await (0, database_1.supabase)()
            .from('order_item_physical')
            .update(payload)
            .eq('id', physicalId)
            .select('*')
            .single();
        (0, database_1.assertNoError)(result, 'physical.updateRefundState');
        return toPhysical(result.data);
    },
    // ── getTimeline ─────────────────────────────────────────────────────────────
    async getTimeline(physicalId) {
        const result = await (0, database_1.supabase)()
            .from('order_timeline_events')
            .select('*')
            .eq('order_item_physical_id', physicalId)
            .order('occurred_at', { ascending: true });
        (0, database_1.assertNoErrorMany)(result, 'physical.getTimeline');
        return (result.data ?? []).map(toTimelineEvent);
    },
    // ── getTimelineForOrder ─────────────────────────────────────────────────────
    async getTimelineForOrder(orderId) {
        const result = await (0, database_1.supabase)()
            .from('order_timeline_events')
            .select('*')
            .eq('order_id', orderId)
            .order('occurred_at', { ascending: true });
        (0, database_1.assertNoErrorMany)(result, 'physical.getTimelineForOrder');
        return (result.data ?? []).map(toTimelineEvent);
    },
    // ── addDeliveryProof ────────────────────────────────────────────────────────
    async addDeliveryProof(input) {
        // Enforce max 5 proofs per item at the application layer
        const countResult = await (0, database_1.supabase)()
            .from('order_delivery_proofs')
            .select('id', { count: 'exact', head: true })
            .eq('order_item_physical_id', input.order_item_physical_id);
        if ((countResult.count ?? 0) >= 5) {
            throw new Error('physical.addDeliveryProof: maximum of 5 proofs already uploaded for this item');
        }
        const result = await (0, database_1.supabase)()
            .from('order_delivery_proofs')
            .insert({
            order_item_physical_id: input.order_item_physical_id,
            order_id: input.order_id,
            cloudinary_public_id: input.cloudinary_public_id,
            secure_url: input.secure_url,
            mime_type: input.mime_type,
            file_size_bytes: input.file_size_bytes,
            uploaded_by: input.uploaded_by,
            uploader_role: input.uploader_role,
        })
            .select('*')
            .single();
        (0, database_1.assertNoError)(result, 'physical.addDeliveryProof');
        return toDeliveryProof(result.data);
    },
    // ── getDeliveryProofs ───────────────────────────────────────────────────────
    async getDeliveryProofs(physicalId) {
        const result = await (0, database_1.supabase)()
            .from('order_delivery_proofs')
            .select('*')
            .eq('order_item_physical_id', physicalId)
            .order('uploaded_at', { ascending: true });
        (0, database_1.assertNoErrorMany)(result, 'physical.getDeliveryProofs');
        return (result.data ?? []).map(toDeliveryProof);
    },
    // ── upsertInvoice ───────────────────────────────────────────────────────────
    // Creates a new invoice version. Version is always max(existing) + 1.
    async upsertInvoice(input) {
        // Get current max version
        const maxResult = await (0, database_1.supabase)()
            .from('order_invoices')
            .select('version')
            .eq('order_id', input.order_id)
            .order('version', { ascending: false })
            .limit(1)
            .maybeSingle();
        const nextVersion = maxResult.data ? maxResult.data['version'] + 1 : 1;
        const result = await (0, database_1.supabase)()
            .from('order_invoices')
            .insert({
            order_id: input.order_id,
            version: nextVersion,
            pdf_cloudinary_public_id: input.pdf_cloudinary_public_id,
            pdf_url: input.pdf_url,
            generated_by: input.generated_by,
            trigger: input.trigger,
        })
            .select('*')
            .single();
        (0, database_1.assertNoError)(result, 'physical.upsertInvoice');
        return toInvoice(result.data);
    },
    // ── getLatestInvoice ────────────────────────────────────────────────────────
    async getLatestInvoice(orderId) {
        const result = await (0, database_1.supabase)()
            .from('order_invoices')
            .select('*')
            .eq('order_id', orderId)
            .order('version', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (!result.data)
            return null;
        return toInvoice(result.data);
    },
    // ── createReceipt ───────────────────────────────────────────────────────────
    // Issued exactly once per order at payment confirmation. Unlike invoices,
    // a receipt documents the payment event itself and is never re-versioned —
    // attempting to create a second receipt for the same order is a no-op
    // that returns the existing one (idempotent, mirrors assignOrderNumber).
    async createReceipt(input) {
        const existing = await this.getReceipt(input.order_id);
        if (existing)
            return existing;
        const result = await (0, database_1.supabase)()
            .from('order_receipts')
            .insert({
            order_id: input.order_id,
            pdf_cloudinary_public_id: input.pdf_cloudinary_public_id,
            pdf_url: input.pdf_url,
            amount_paid: input.amount_paid,
            currency: input.currency,
            payment_method: input.payment_method,
            transaction_reference: input.transaction_reference,
            generated_by: input.generated_by,
        })
            .select('*')
            .single();
        // Unique constraint race: another request created it first — fetch and return.
        if (result.error?.code === '23505') {
            const fallback = await this.getReceipt(input.order_id);
            if (fallback)
                return fallback;
        }
        (0, database_1.assertNoError)(result, 'physical.createReceipt');
        return toReceipt(result.data);
    },
    // ── getReceipt ──────────────────────────────────────────────────────────────
    async getReceipt(orderId) {
        const result = await (0, database_1.supabase)()
            .from('order_receipts')
            .select('*')
            .eq('order_id', orderId)
            .maybeSingle();
        if (!result.data)
            return null;
        return toReceipt(result.data);
    },
    // ── createRefundRequest ─────────────────────────────────────────────────────
    async createRefundRequest(input) {
        // Only one pending request per physical item at a time
        const existing = await (0, database_1.supabase)()
            .from('order_refund_requests')
            .select('id')
            .eq('order_item_physical_id', input.order_item_physical_id)
            .eq('status', 'PENDING_ADMIN')
            .maybeSingle();
        if (existing.data) {
            throw new Error('physical.createRefundRequest: a pending refund request already exists for this item');
        }
        const result = await (0, database_1.supabase)()
            .from('order_refund_requests')
            .insert({
            order_item_physical_id: input.order_item_physical_id,
            order_id: input.order_id,
            requested_by: input.requested_by,
            reason: input.reason,
            status: 'PENDING_ADMIN',
        })
            .select('*')
            .single();
        (0, database_1.assertNoError)(result, 'physical.createRefundRequest');
        return toRefundRequest(result.data);
    },
    // ── updateRefundRequest ─────────────────────────────────────────────────────
    async updateRefundRequest(requestId, patch) {
        const result = await (0, database_1.supabase)()
            .from('order_refund_requests')
            .update({
            status: patch.status,
            admin_notes: patch.admin_notes ?? null,
            reviewed_by: patch.reviewed_by,
            reviewed_at: new Date().toISOString(),
        })
            .eq('id', requestId)
            .select('*')
            .single();
        (0, database_1.assertNoError)(result, 'physical.updateRefundRequest');
        return toRefundRequest(result.data);
    },
    // ── getRefundRequests ───────────────────────────────────────────────────────
    async getRefundRequests(orderId) {
        const result = await (0, database_1.supabase)()
            .from('order_refund_requests')
            .select('*')
            .eq('order_id', orderId)
            .order('created_at', { ascending: false });
        (0, database_1.assertNoErrorMany)(result, 'physical.getRefundRequests');
        return (result.data ?? []).map(toRefundRequest);
    },
    // ── findPendingRefundRequests ───────────────────────────────────────────────
    // Used by admin list view.
    async findPendingRefundRequests() {
        const result = await (0, database_1.supabase)()
            .from('order_refund_requests')
            .select('*')
            .eq('status', 'PENDING_ADMIN')
            .order('created_at', { ascending: true });
        (0, database_1.assertNoErrorMany)(result, 'physical.findPendingRefundRequests');
        return (result.data ?? []).map(toRefundRequest);
    },
    // ── findPhysicalItemsAwaitingConfirmation ───────────────────────────────────
    // Used by the auto-cancel job. Returns items that have been in
    // AWAITING_CONFIRMATION/_ACTIVE for longer than the grace period.
    async findPhysicalItemsAwaitingConfirmation(olderThanDate) {
        const result = await (0, database_1.supabase)()
            .from('order_item_physical')
            .select('*')
            .in('timeline_status', ['AWAITING_CONFIRMATION', 'AWAITING_CONFIRMATION_ACTIVE'])
            .lt('updated_at', olderThanDate.toISOString());
        (0, database_1.assertNoErrorMany)(result, 'physical.findItemsAwaitingConfirmation');
        return (result.data ?? []).map(toPhysical);
    },
    // ── findAllAdminList ────────────────────────────────────────────────────────
    // Paginated admin view — all physical order items with filters.
    // artist_id/buyer_id/order_number require resolving to order_item_id /
    // order_id sets first since order_item_physical does not carry those
    // columns directly (it only references order_item_id and order_id).
    async findAllAdminList(filters) {
        const page = Math.max(1, filters.page ?? 1);
        const limit = Math.min(50, Math.max(1, filters.limit ?? 20));
        const from = (page - 1) * limit;
        const to = from + limit - 1;
        // ── Pre-resolve artist_id → order_item_id[] ─────────────────────────────
        let scopedOrderItemIds = null;
        if (filters.artist_id) {
            const itemsResult = await (0, database_1.supabase)()
                .from('order_items')
                .select('id')
                .eq('seller_id', filters.artist_id);
            if (itemsResult.error) {
                throw new Error(`[physical.findAllAdminList.artist_id] ${itemsResult.error.message}`);
            }
            const resolvedItemIds = (itemsResult.data ?? []).map((r) => r['id']);
            if (!resolvedItemIds.length) {
                return { data: [], total: 0, page, limit, total_pages: 0, has_next: false, has_prev: false };
            }
            scopedOrderItemIds = resolvedItemIds;
        }
        // ── Pre-resolve buyer_id / order_number → order_id[] ─────────────────────
        let scopedOrderIds = null;
        if (filters.buyer_id || filters.order_number) {
            let ordersQuery = (0, database_1.supabase)().from('orders').select('id');
            if (filters.buyer_id)
                ordersQuery = ordersQuery.eq('buyer_id', filters.buyer_id);
            if (filters.order_number)
                ordersQuery = ordersQuery.ilike('order_number', filters.order_number);
            const ordersResult = await ordersQuery;
            if (ordersResult.error) {
                throw new Error(`[physical.findAllAdminList.buyer_or_number] ${ordersResult.error.message}`);
            }
            const resolvedOrderIds = (ordersResult.data ?? []).map((r) => r['id']);
            if (!resolvedOrderIds.length) {
                return { data: [], total: 0, page, limit, total_pages: 0, has_next: false, has_prev: false };
            }
            scopedOrderIds = resolvedOrderIds;
        }
        let query = (0, database_1.supabase)()
            .from('order_item_physical')
            .select('*', { count: 'exact' });
        if (scopedOrderItemIds)
            query = query.in('order_item_id', scopedOrderItemIds);
        if (scopedOrderIds)
            query = query.in('order_id', scopedOrderIds);
        if (filters.delivery_status)
            query = query.eq('delivery_status', filters.delivery_status);
        if (filters.timeline_status)
            query = query.eq('timeline_status', filters.timeline_status);
        if (filters.timeline_status_in)
            query = query.in('timeline_status', filters.timeline_status_in);
        if (filters.refund_status)
            query = query.eq('refund_status', filters.refund_status);
        if (filters.courier_name)
            query = query.ilike('courier_name', `%${filters.courier_name}%`);
        if (filters.tracking_id)
            query = query.eq('tracking_id', filters.tracking_id);
        if (filters.date_from)
            query = query.gte('created_at', filters.date_from);
        if (filters.date_to)
            query = query.lte('created_at', filters.date_to);
        query = query
            .order('created_at', { ascending: filters.sort_order === 'asc' })
            .range(from, to);
        const result = await query;
        if (result.error) {
            throw new Error(`[physical.findAllAdminList] ${result.error.message}`);
        }
        const total = result.count ?? 0;
        const total_pages = Math.ceil(total / limit);
        return {
            data: (result.data ?? []).map(toPhysical),
            total,
            page,
            limit,
            total_pages,
            has_next: page < total_pages,
            has_prev: page > 1,
        };
    },
    // ── findBySellerWithItems ───────────────────────────────────────────────────
    // Artist sees only their physical items (joined to order_items.seller_id).
    async findBySellerWithItems(sellerId, filters) {
        const page = Math.max(1, filters.page ?? 1);
        const limit = Math.min(50, Math.max(1, filters.limit ?? 20));
        const from = (page - 1) * limit;
        const to = from + limit - 1;
        // First get the order_item_ids belonging to this seller
        const itemsResult = await (0, database_1.supabase)()
            .from('order_items')
            .select('id')
            .eq('seller_id', sellerId)
            .eq('artwork_format', 'PHYSICAL');
        if (itemsResult.error) {
            throw new Error(`[physical.findBySeller] ${itemsResult.error.message}`);
        }
        const sellerItemIds = (itemsResult.data ?? []).map((r) => r['id']);
        if (!sellerItemIds.length) {
            return { data: [], total: 0, page, limit, total_pages: 0, has_next: false, has_prev: false };
        }
        let query = (0, database_1.supabase)()
            .from('order_item_physical')
            .select('*', { count: 'exact' })
            .in('order_item_id', sellerItemIds);
        if (filters.delivery_status)
            query = query.eq('delivery_status', filters.delivery_status);
        if (filters.timeline_status)
            query = query.eq('timeline_status', filters.timeline_status);
        if (filters.timeline_status_in)
            query = query.in('timeline_status', filters.timeline_status_in);
        if (filters.refund_status)
            query = query.eq('refund_status', filters.refund_status);
        if (filters.date_from)
            query = query.gte('created_at', filters.date_from);
        if (filters.date_to)
            query = query.lte('created_at', filters.date_to);
        query = query
            .order('created_at', { ascending: filters.sort_order === 'asc' })
            .range(from, to);
        const result = await query;
        if (result.error) {
            throw new Error(`[physical.findBySeller] ${result.error.message}`);
        }
        const total = result.count ?? 0;
        const total_pages = Math.ceil(total / limit);
        return {
            data: (result.data ?? []).map(toPhysical),
            total,
            page,
            limit,
            total_pages,
            has_next: page < total_pages,
            has_prev: page > 1,
        };
    },
    // ── findByBuyerWithItems ────────────────────────────────────────────────────
    // Buyer sees physical items for all their orders.
    async findByBuyerWithItems(buyerId, filters) {
        const page = Math.max(1, filters.page ?? 1);
        const limit = Math.min(50, Math.max(1, filters.limit ?? 20));
        const from = (page - 1) * limit;
        const to = from + limit - 1;
        // Get order IDs belonging to this buyer
        const ordersResult = await (0, database_1.supabase)()
            .from('orders')
            .select('id')
            .eq('buyer_id', buyerId);
        if (ordersResult.error) {
            throw new Error(`[physical.findByBuyer] ${ordersResult.error.message}`);
        }
        const buyerOrderIds = (ordersResult.data ?? []).map((r) => r['id']);
        if (!buyerOrderIds.length) {
            return { data: [], total: 0, page, limit, total_pages: 0, has_next: false, has_prev: false };
        }
        let query = (0, database_1.supabase)()
            .from('order_item_physical')
            .select('*', { count: 'exact' })
            .in('order_id', buyerOrderIds);
        if (filters.delivery_status)
            query = query.eq('delivery_status', filters.delivery_status);
        if (filters.timeline_status)
            query = query.eq('timeline_status', filters.timeline_status);
        if (filters.timeline_status_in)
            query = query.in('timeline_status', filters.timeline_status_in);
        if (filters.date_from)
            query = query.gte('created_at', filters.date_from);
        if (filters.date_to)
            query = query.lte('created_at', filters.date_to);
        query = query
            .order('created_at', { ascending: filters.sort_order === 'asc' })
            .range(from, to);
        const result = await query;
        if (result.error) {
            throw new Error(`[physical.findByBuyer] ${result.error.message}`);
        }
        const total = result.count ?? 0;
        const total_pages = Math.ceil(total / limit);
        return {
            data: (result.data ?? []).map(toPhysical),
            total,
            page,
            limit,
            total_pages,
            has_next: page < total_pages,
            has_prev: page > 1,
        };
    },
    // ── getUserProfile ──────────────────────────────────────────────────────────
    // Light profile lookup for buyer/seller embedding in order views.
    async getUserProfile(userId) {
        const result = await (0, database_1.supabase)()
            .from('users')
            .select('id, username, avatar_url')
            .eq('id', userId)
            .single();
        if (result.error)
            return null;
        return {
            id: result.data['id'],
            username: result.data['username'],
            avatar_url: result.data['avatar_url'] ?? null,
        };
    },
    // ── findAllAdmins ───────────────────────────────────────────────────────────
    // Returns user IDs of all ADMIN users for bulk notification.
    async findAllAdminIds() {
        const result = await (0, database_1.supabase)()
            .from('users')
            .select('id')
            .eq('role', 'ADMIN')
            .eq('status', 'ACTIVE')
            .is('deleted_at', null);
        if (result.error)
            return [];
        return (result.data ?? []).map((r) => r['id']);
    },
    // ── getShippingAddress ──────────────────────────────────────────────────────
    // Delivery address lives on orders.shipping_address (immutable snapshot,
    // see order.repository.ts). Exposed here so physical order views can embed
    // it without the caller needing to know about the base orders table.
    async getShippingAddress(orderId) {
        const result = await (0, database_1.supabase)()
            .from('orders')
            .select('shipping_address')
            .eq('id', orderId)
            .single();
        if (result.error || !result.data?.['shipping_address'])
            return null;
        return result.data['shipping_address'];
    },
};
//# sourceMappingURL=physical-order.repository.js.map