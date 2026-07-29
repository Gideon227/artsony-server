"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteCommentValidation = exports.listRepliesValidation = exports.listCommentsValidation = exports.createCommentValidation = void 0;
exports.handleCreateComment = handleCreateComment;
exports.handleListComments = handleListComments;
exports.handleListReplies = handleListReplies;
exports.handleDeleteComment = handleDeleteComment;
const express_validator_1 = require("express-validator");
const comment_service_1 = require("../services/comment.service");
const errors_1 = require("../../../common/errors");
function assertValid(req) {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        const fields = Object.fromEntries(errors.array().map((e) => ['path' in e ? e.path : 'field', e.msg]));
        throw new errors_1.ValidationError('Validation failed', fields);
    }
}
function requireAuth(req) {
    if (!req.auth)
        throw new errors_1.UnauthorizedError();
    return req.auth;
}
// ── Validation chains ────────────────────────────────────────────────────────
exports.createCommentValidation = [
    (0, express_validator_1.body)('artwork_id').isUUID(),
    (0, express_validator_1.body)('body').isString().trim().isLength({ min: 1, max: 1000 }),
    (0, express_validator_1.body)('parent_id').optional().isUUID(),
];
exports.listCommentsValidation = [
    (0, express_validator_1.param)('artworkId').isUUID(),
    (0, express_validator_1.query)('page').optional().isInt({ min: 1 }).toInt(),
    (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
];
exports.listRepliesValidation = [
    (0, express_validator_1.param)('commentId').isUUID(),
    (0, express_validator_1.query)('page').optional().isInt({ min: 1 }).toInt(),
    (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
];
exports.deleteCommentValidation = [
    (0, express_validator_1.param)('commentId').isUUID(),
];
// ── Handlers ──────────────────────────────────────────────────────────────────
async function handleCreateComment(req, res, next) {
    try {
        assertValid(req);
        const { sub } = requireAuth(req);
        const { artwork_id, body: commentBody, parent_id } = req.body;
        const comment = await comment_service_1.commentService.create({ artwork_id, body: commentBody, parent_id }, sub);
        res.status(201).json({ success: true, data: comment });
    }
    catch (err) {
        next(err);
    }
}
async function handleListComments(req, res, next) {
    try {
        assertValid(req);
        const { artworkId } = req.params;
        const { page, limit } = req.query;
        const result = await comment_service_1.commentService.listTopLevel({ artwork_id: artworkId, page, limit });
        res.json({ success: true, ...result });
    }
    catch (err) {
        next(err);
    }
}
async function handleListReplies(req, res, next) {
    try {
        assertValid(req);
        const { commentId } = req.params;
        const { page, limit } = req.query;
        const result = await comment_service_1.commentService.listReplies(commentId, { page, limit });
        res.json({ success: true, ...result });
    }
    catch (err) {
        next(err);
    }
}
async function handleDeleteComment(req, res, next) {
    try {
        assertValid(req);
        const { sub } = requireAuth(req);
        const { commentId } = req.params;
        await comment_service_1.commentService.delete(commentId, sub);
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
}
//# sourceMappingURL=comment.controller.js.map