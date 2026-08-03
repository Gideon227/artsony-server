import { followRepository } from '../repositories/follow.repository'
import { notificationService } from '@/modules/messaging/services/notification.service'
import { ValidationError } from '@/common/errors'
import type { FollowUser, FollowFilters } from '@/common/types/social.types'
import type { PaginatedResult } from '@/common/types/commerce.types'

export const followService = {
    async toggle(followerId: string, followingId: string): Promise<{ is_following: boolean }> {
        if (followerId === followingId) {
            throw new ValidationError('Validation failed', { following_id: 'You cannot follow yourself' })
        }

        const isFollowing = await followRepository.toggle(followerId, followingId)

        if (isFollowing) {
            void notificationService.create({
                recipientId: followingId,
                actorId: followerId,
                type: 'follow',
                entityId: followerId,
                entityType: 'user',
                data: {},
            }).catch(() => {})
        }

        return { is_following: isFollowing }
    },

    async isFollowing(followerId: string, followingId: string): Promise<boolean> {
        return followRepository.isFollowing(followerId, followingId)
    },

    async getFollowedIds(followerId: string): Promise<string[]> {
        return followRepository.getFollowedIds(followerId)
    },

    async listFollowers(userId: string, filters: FollowFilters): Promise<PaginatedResult<FollowUser>> {
        return followRepository.listFollowers(userId, filters)
    },

    async listFollowing(userId: string, filters: FollowFilters): Promise<PaginatedResult<FollowUser>> {
        return followRepository.listFollowing(userId, filters)
    },
}