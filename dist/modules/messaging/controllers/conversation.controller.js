"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchConversationsValidation = exports.listConversationsValidation = exports.updateConversationValidation = exports.createConversationValidation = void 0;
exports.handleCreateConversation = handleCreateConversation;
exports.handleListConversations = handleListConversations;
exports.handleSearchConversations = handleSearchConversations;
exports.handleGetConversation = handleGetConversation;
exports.handleUpdateConversation = handleUpdateConversation;
exports.handleMuteConversation = handleMuteConversation;
exports.handleLeaveConversation = handleLeaveConversation;
const express_validator_1 = require("express-validator");
const conversation_service_1 = require("../services/conversation.service");
const errors_1 = require("../../../common/errors");
// ── Validation chains ────────────────────────────────────────────────────────
exports.createConversationValidation = [
    (0, express_validator_1.body)('type')
        .isIn(['direct', 'broadcast'])
        .withMessage('type must be "direct" or "broadcast"'),
    (0, express_validator_1.body)('recipient_id')
        .if((0, express_validator_1.body)('type').equals('direct'))
        .isUUID()
        .withMessage('recipient_id must be a valid UUID for direct conversations'),
    (0, express_validator_1.body)('recipient_ids')
        .if((0, express_validator_1.body)('type').equals('broadcast'))
        .isArray({ min: 1, max: 1000 })
        .withMessage('recipient_ids must be an array of 1–1000 UUIDs'),
    (0, express_validator_1.body)('recipient_ids.*')
        .if((0, express_validator_1.body)('type').equals('broadcast'))
        .isUUID()
        .withMessage('Each recipient_id must be a valid UUID'),
    (0, express_validator_1.body)('title')
        .optional()
        .isString()
        .isLength({ max: 120 })
        .trim()
        .withMessage('title must be a string up to 120 characters'),
    (0, express_validator_1.body)('initial_body')
        .if((0, express_validator_1.body)('type').equals('broadcast'))
        .isString()
        .isLength({ min: 1, max: 4000 })
        .trim()
        .withMessage('initial_body is required for broadcast conversations (max 4000 chars)'),
];
exports.updateConversationValidation = [
    (0, express_validator_1.param)('id').isUUID().withMessage('Conversation id must be a valid UUID'),
    (0, express_validator_1.body)('title')
        .optional()
        .isString()
        .isLength({ max: 120 })
        .trim(),
];
exports.listConversationsValidation = [
    (0, express_validator_1.query)('cursor').optional().isISO8601().withMessage('cursor must be an ISO 8601 date string'),
    (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
    (0, express_validator_1.query)('type').optional().isIn(['direct', 'broadcast']),
];
exports.searchConversationsValidation = [
    (0, express_validator_1.query)('q')
        .isString()
        .isLength({ min: 2, max: 100 })
        .trim()
        .withMessage('q must be 2–100 characters'),
    (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
];
// ── Handlers ─────────────────────────────────────────────────────────────────
function assertValid(req) {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        const fields = Object.fromEntries(errors.array().map((e) => ['path' in e ? e.path : 'field', e.msg]));
        throw new errors_1.ValidationError('Validation failed', fields);
    }
}
// POST /api/conversations
async function handleCreateConversation(req, res, next) {
    try {
        assertValid(req);
        const userId = req.auth.sub;
        const { type, recipient_id, recipient_ids, title, initial_body } = req.body;
        if (type === 'direct') {
            const { conversationId } = await conversation_service_1.conversationService.getOrCreateDirect({
                initiator_id: userId,
                recipient_id: recipient_id,
            });
            const conversation = await conversation_service_1.conversationService.getById(conversationId, userId);
            res.status(201).json({ success: true, data: conversation });
            return;
        }
        // broadcast
        const convId = await conversation_service_1.conversationService.createBroadcast({
            sender_id: userId,
            title: title ?? null,
            recipient_ids: recipient_ids,
            initial_body: initial_body,
        });
        // Send the initial broadcast message
        const { messageService } = await import('../services/message.service.js');
        await messageService.send({
            conversation_id: convId,
            sender_id: userId,
            body: initial_body,
            type: 'text',
            reply_to_id: null,
            metadata: {},
            client_message_id: `broadcast-init-${convId}`,
        });
        const conversation = await conversation_service_1.conversationService.getById(convId, userId);
        res.status(201).json({ success: true, data: conversation });
    }
    catch (err) {
        next(err);
    }
}
// GET /api/conversations
async function handleListConversations(req, res, next) {
    try {
        assertValid(req);
        const userId = req.auth.sub;
        // FIX: Cast via unknown to bypass ParsedQs type restrictions safely
        const { cursor, limit, type } = req.query;
        const page = await conversation_service_1.conversationService.list({
            user_id: userId,
            // FIX: Conditional spreading to ensure undefined is never passed explicitly
            ...(cursor !== undefined ? { cursor } : {}),
            ...(limit !== undefined ? { limit } : {}),
            ...(type !== undefined ? { type } : {}),
        });
        res.json({ success: true, data: page });
    }
    catch (err) {
        next(err);
    }
}
// GET /api/conversations/search
async function handleSearchConversations(req, res, next) {
    try {
        assertValid(req);
        const userId = req.auth.sub;
        // FIX: Cast via unknown to bypass ParsedQs type restrictions safely
        const { q, limit } = req.query;
        const results = await conversation_service_1.conversationService.search({
            user_id: userId,
            query: q,
            // FIX: Conditional spreading
            ...(limit !== undefined ? { limit } : {}),
        });
        res.json({ success: true, data: results });
    }
    catch (err) {
        next(err);
    }
}
// GET /api/conversations/:id
async function handleGetConversation(req, res, next) {
    try {
        const userId = req.auth.sub;
        const conversationId = req.params['id'];
        const conversation = await conversation_service_1.conversationService.getById(conversationId, userId);
        res.json({ success: true, data: conversation });
    }
    catch (err) {
        next(err);
    }
}
// PATCH /api/conversations/:id
async function handleUpdateConversation(req, res, next) {
    try {
        assertValid(req);
        const userId = req.auth.sub;
        const conversationId = req.params['id'];
        const { title, metadata } = req.body;
        const updated = await conversation_service_1.conversationService.update(conversationId, userId, {
            // FIX: Conditional spreading for the update payload
            ...(title !== undefined ? { title } : {}),
            ...(metadata !== undefined ? { metadata } : {}),
        });
        res.json({ success: true, data: updated });
    }
    catch (err) {
        next(err);
    }
}
// POST /api/conversations/:id/mute
async function handleMuteConversation(req, res, next) {
    try {
        const userId = req.auth.sub;
        const conversationId = req.params['id'];
        const muted = req.body['muted'] === true;
        await conversation_service_1.conversationService.setMuted(conversationId, userId, muted);
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
}
// DELETE /api/conversations/:id  (leave)
async function handleLeaveConversation(req, res, next) {
    try {
        const userId = req.auth.sub;
        const conversationId = req.params['id'];
        await conversation_service_1.conversationService.leave(conversationId, userId);
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
}
//# sourceMappingURL=conversation.controller.js.map