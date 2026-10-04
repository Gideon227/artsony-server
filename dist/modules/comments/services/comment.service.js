"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.commentService = void 0;
const comment_repository_1 = require("../repositories/comment.repository");
const notification_service_1 = require("../../../modules/messaging/services/notification.service");
const artwork_repository_1 = require("../../../modules/artwork/repositories/artwork.repository");
const user_repository_1 = require("../../../modules/auth/repositories/user.repository");
const block_repository_1 = require("../../../modules/block/repositories/block.repository");
const privacy_util_1 = require("../../../common/utils/privacy.util");
const errors_1 = require("../../../common/errors");
exports.commentService = {
    async create(input, userId) {
        const artwork = await artwork_repository_1.artworkRepository.findById(input.artwork_id);
        if (!artwork)
            throw new errors_1.NotFoundError('Artwork');
        if (!artwork.allow_comments) {
            throw new errors_1.ForbiddenError('Comments are turned off for this artwork');
        }
        if (artwork.creator_id !== userId) {
            const [blocked, settings] = await Promise.all([
                block_repository_1.blockRepository.isBlockedEitherDirection(userId, artwork.creator_id),
                user_repository_1.userRepository.getPrivacySettings(artwork.creator_id),
            ]);
            if (blocked)
                throw new errors_1.ForbiddenError('You cannot comment on this artwork');
            const allowed = await (0, privacy_util_1.isInteractionAllowed)(settings.who_can_comment, userId, artwork.creator_id);
            if (!allowed)
                throw new errors_1.ForbiddenError('This artist limits who can comment on their artwork');
        }
        let parentRecipientId;
        if (input.parent_id) {
            const parent = await comment_repository_1.commentRepository.getById(input.parent_id);
            if (!parent || parent.artwork_id !== input.artwork_id) {
                throw new errors_1.ValidationError('Validation failed', { parent_id: 'Parent comment not found on this artwork' });
            }
            // Keep threads flat (one level of replies) — replying to a reply
            // attaches to the original top-level comment instead of nesting further.
            input = { ...input, parent_id: parent.parent_id ?? parent.id };
            parentRecipientId = parent.user_id;
        }
        const comment = await comment_repository_1.commentRepository.create({ ...input, userId });
        const recipientId = input.parent_id ? parentRecipientId : artwork.creator_id;
        if (recipientId && recipientId !== userId) {
            void notification_service_1.notificationService.create({
                recipientId,
                actorId: userId,
                type: input.parent_id ? 'reply' : 'comment',
                entityId: comment.id,
                entityType: 'artwork_comment',
                data: {
                    body: `commented on your ${input.parent_id ? 'comment' : 'artwork'}: "${input.body.slice(0, 80)}"`,
                    artwork_id: input.artwork_id,
                },
            }).catch(() => { });
        }
        return comment;
    },
    async listTopLevel(filters) {
        return comment_repository_1.commentRepository.listTopLevel(filters);
    },
    async listReplies(parentId, filters) {
        return comment_repository_1.commentRepository.listReplies(parentId, filters);
    },
    async delete(commentId, userId) {
        const comment = await comment_repository_1.commentRepository.getById(commentId);
        if (!comment)
            throw new errors_1.NotFoundError('Comment');
        if (comment.user_id !== userId)
            throw new errors_1.ForbiddenError('You can only delete your own comments');
        await comment_repository_1.commentRepository.softDelete(commentId);
    },
};
//# sourceMappingURL=comment.service.js.map