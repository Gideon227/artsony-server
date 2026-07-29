"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.followService = void 0;
const follow_repository_1 = require("../repositories/follow.repository");
const notification_service_1 = require("../../../modules/messaging/services/notification.service");
const errors_1 = require("../../../common/errors");
exports.followService = {
    async toggle(followerId, followingId) {
        if (followerId === followingId) {
            throw new errors_1.ValidationError('Validation failed', { following_id: 'You cannot follow yourself' });
        }
        const isFollowing = await follow_repository_1.followRepository.toggle(followerId, followingId);
        if (isFollowing) {
            void notification_service_1.notificationService.create({
                recipientId: followingId,
                actorId: followerId,
                type: 'follow',
                entityId: followerId,
                entityType: 'user',
                data: {},
            }).catch(() => { });
        }
        return { is_following: isFollowing };
    },
    async isFollowing(followerId, followingId) {
        return follow_repository_1.followRepository.isFollowing(followerId, followingId);
    },
    async getFollowedIds(followerId) {
        return follow_repository_1.followRepository.getFollowedIds(followerId);
    },
    async listFollowers(userId, filters) {
        return follow_repository_1.followRepository.listFollowers(userId, filters);
    },
    async listFollowing(userId, filters) {
        return follow_repository_1.followRepository.listFollowing(userId, filters);
    },
};
//# sourceMappingURL=follow.service.js.map