"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markReadValidation = exports.searchMessagesValidation = exports.listMessagesValidation = exports.editMessageValidation = exports.sendMessageValidation = void 0;
exports.handleListMessages = handleListMessages;
exports.handleSearchMessages = handleSearchMessages;
exports.handleSendMessage = handleSendMessage;
exports.handleEditMessage = handleEditMessage;
exports.handleDeleteMessage = handleDeleteMessage;
exports.handleMarkRead = handleMarkRead;
exports.handleGetReadReceipts = handleGetReadReceipts;
const express_validator_1 = require("express-validator");
const message_service_1 = require("../services/message.service");
const errors_1 = require("../../../common/errors");
const uuid_1 = require("uuid");
// ── Validation chains ────────────────────────────────────────────────────────
exports.sendMessageValidation = [
    (0, express_validator_1.param)('id')
        .isUUID()
        .withMessage('Conversation id must be a valid UUID'),
    (0, express_validator_1.body)('body')
        .isString()
        .isLength({ min: 1, max: 4000 })
        .trim()
        .withMessage('body is required and must be 1–4000 characters'),
    (0, express_validator_1.body)('type')
        .optional()
        .isIn(['text', 'image', 'system'])
        .withMessage('type must be text, image, or system'),
    (0, express_validator_1.body)('reply_to_id')
        .optional({ nullable: true })
        .isUUID()
        .withMessage('reply_to_id must be a valid UUID'),
    (0, express_validator_1.body)('client_message_id')
        .optional()
        .isString()
        .isLength({ min: 1, max: 100 })
        .withMessage('client_message_id must be a non-empty string'),
];
exports.editMessageValidation = [
    (0, express_validator_1.param)('id').isUUID().withMessage('Conversation id must be a valid UUID'),
    (0, express_validator_1.param)('mid').isUUID().withMessage('Message id must be a valid UUID'),
    (0, express_validator_1.body)('body')
        .isString()
        .isLength({ min: 1, max: 4000 })
        .trim()
        .withMessage('body is required and must be 1–4000 characters'),
];
exports.listMessagesValidation = [
    (0, express_validator_1.param)('id').isUUID().withMessage('Conversation id must be a valid UUID'),
    (0, express_validator_1.query)('cursor')
        .optional()
        .isUUID()
        .withMessage('cursor must be a valid message UUID'),
    (0, express_validator_1.query)('limit')
        .optional()
        .isInt({ min: 1, max: 50 })
        .toInt()
        .withMessage('limit must be between 1 and 50'),
];
exports.searchMessagesValidation = [
    (0, express_validator_1.param)('id').isUUID().withMessage('Conversation id must be a valid UUID'),
    (0, express_validator_1.query)('q')
        .isString()
        .isLength({ min: 2, max: 100 })
        .trim()
        .withMessage('q must be 2–100 characters'),
    (0, express_validator_1.query)('limit')
        .optional()
        .isInt({ min: 1, max: 50 })
        .toInt(),
    (0, express_validator_1.query)('cursor')
        .optional()
        .isUUID()
        .withMessage('cursor must be a valid message UUID'),
];
exports.markReadValidation = [
    (0, express_validator_1.param)('id').isUUID().withMessage('Conversation id must be a valid UUID'),
    (0, express_validator_1.body)('up_to_message_id')
        .isUUID()
        .withMessage('up_to_message_id must be a valid UUID'),
];
// ── Handler helpers ──────────────────────────────────────────────────────────
function assertValid(req) {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        const fields = Object.fromEntries(errors.array().map((e) => ['path' in e ? e.path : 'field', e.msg]));
        throw new errors_1.ValidationError('Validation failed', fields);
    }
}
// ── Handlers ─────────────────────────────────────────────────────────────────
// GET /api/conversations/:id/messages
async function handleListMessages(req, res, next) {
    try {
        assertValid(req);
        const userId = req.auth.sub;
        const conversationId = req.params['id'];
        // FIX: Cast via unknown to bypass ParsedQs type restrictions safely
        const { cursor, limit } = req.query;
        const page = await message_service_1.messageService.list({
            conversation_id: conversationId,
            user_id: userId,
            // FIX: Conditional spreading
            ...(cursor !== undefined ? { cursor } : {}),
            ...(limit !== undefined ? { limit } : {}),
        });
        res.json({ success: true, data: page });
    }
    catch (err) {
        next(err);
    }
}
// GET /api/conversations/:id/messages/search
async function handleSearchMessages(req, res, next) {
    try {
        assertValid(req);
        const userId = req.auth.sub;
        const conversationId = req.params['id'];
        // FIX: Cast via unknown to bypass ParsedQs type restrictions safely
        const { q, limit, cursor } = req.query;
        const results = await message_service_1.messageService.search({
            conversation_id: conversationId,
            user_id: userId,
            query: q,
            // FIX: Conditional spreading
            ...(limit !== undefined ? { limit } : {}),
            ...(cursor !== undefined ? { cursor } : {}),
        });
        res.json({ success: true, data: results });
    }
    catch (err) {
        next(err);
    }
}
// POST /api/conversations/:id/messages
async function handleSendMessage(req, res, next) {
    try {
        assertValid(req);
        const userId = req.auth.sub;
        const conversationId = req.params['id'];
        const { body: msgBody, type, reply_to_id, metadata, client_message_id } = req.body;
        const message = await message_service_1.messageService.send({
            conversation_id: conversationId,
            sender_id: userId,
            body: msgBody,
            type: type ?? 'text',
            reply_to_id: reply_to_id ?? null,
            // If the REST client did not supply a client_message_id, generate one
            // so idempotency tracking still works for this request.
            client_message_id: client_message_id ?? (0, uuid_1.v4)(),
            ...(metadata !== undefined
                ? { metadata: metadata }
                : {}),
        });
        res.status(201).json({ success: true, data: message });
    }
    catch (err) {
        next(err);
    }
}
// PATCH /api/conversations/:id/messages/:mid
async function handleEditMessage(req, res, next) {
    try {
        assertValid(req);
        const userId = req.auth.sub;
        const messageId = req.params['mid'];
        const { body: newBody } = req.body;
        const updated = await message_service_1.messageService.edit({
            message_id: messageId,
            user_id: userId,
            body: newBody,
        });
        res.json({ success: true, data: updated });
    }
    catch (err) {
        next(err);
    }
}
// DELETE /api/conversations/:id/messages/:mid
async function handleDeleteMessage(req, res, next) {
    try {
        const userId = req.auth.sub;
        const messageId = req.params['mid'];
        await message_service_1.messageService.delete({
            message_id: messageId,
            user_id: userId,
        });
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
}
// POST /api/conversations/:id/messages/read
async function handleMarkRead(req, res, next) {
    try {
        assertValid(req);
        const userId = req.auth.sub;
        const conversationId = req.params['id'];
        const { up_to_message_id } = req.body;
        await message_service_1.messageService.markRead({
            conversation_id: conversationId,
            user_id: userId,
            up_to_message_id,
        });
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
}
// GET /api/conversations/:id/messages/:mid/reads
async function handleGetReadReceipts(req, res, next) {
    try {
        const userId = req.auth.sub;
        const messageId = req.params['mid'];
        const summary = await message_service_1.messageService.getReadReceipts(messageId, userId);
        res.json({ success: true, data: summary });
    }
    catch (err) {
        next(err);
    }
}
//# sourceMappingURL=message.controller.js.map