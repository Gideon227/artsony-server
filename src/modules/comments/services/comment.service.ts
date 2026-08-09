import { commentRepository } from '../repositories/comment.repository'
import { notificationService } from '@/modules/messaging/services/notification.service'
import { artworkRepository } from '@/modules/artwork/repositories/artwork.repository'
import { userRepository } from '@/modules/auth/repositories/user.repository'
import { blockRepository } from '@/modules/block/repositories/block.repository'
import { isInteractionAllowed } from '@/common/utils/privacy.util'
import { ForbiddenError, NotFoundError, ValidationError } from '@/common/errors'
import type { CommentWithAuthor, CreateCommentInput, CommentFilters } from '@/common/types/social.types'
import type { PaginatedResult } from '@/common/types/commerce.types'

export const commentService = {
  async create(input: CreateCommentInput, userId: string): Promise<CommentWithAuthor> {
    const artwork = await artworkRepository.findById(input.artwork_id)
    if (!artwork) throw new NotFoundError('Artwork')

    if (artwork.creator_id !== userId) {
      const [blocked, settings] = await Promise.all([
        blockRepository.isBlockedEitherDirection(userId, artwork.creator_id),
        userRepository.getPrivacySettings(artwork.creator_id),
      ])
      if (blocked) throw new ForbiddenError('You cannot comment on this artwork')
      const allowed = await isInteractionAllowed(settings.who_can_comment, userId, artwork.creator_id)
      if (!allowed) throw new ForbiddenError('This artist limits who can comment on their artwork')
    }

    let parentRecipientId: string | undefined

    if (input.parent_id) {
      const parent = await commentRepository.getById(input.parent_id)
      if (!parent || parent.artwork_id !== input.artwork_id) {
        throw new ValidationError('Validation failed', { parent_id: 'Parent comment not found on this artwork' })
      }
      // Keep threads flat (one level of replies) — replying to a reply
      // attaches to the original top-level comment instead of nesting further.
      input = { ...input, parent_id: parent.parent_id ?? parent.id }
      parentRecipientId = parent.user_id
    }

    const comment = await commentRepository.create({ ...input, userId })

    const recipientId = input.parent_id ? parentRecipientId : artwork.creator_id

    if (recipientId && recipientId !== userId) {
      void notificationService.create({
        recipientId,
        actorId:    userId,
        type:       input.parent_id ? 'reply' : 'comment',
        entityId:   comment.id,
        entityType: 'artwork_comment',
        data: {
          body:       `commented on your ${input.parent_id ? 'comment' : 'artwork'}: "${input.body.slice(0, 80)}"`,
          artwork_id: input.artwork_id,
        },
      }).catch(() => {})
    }

    return comment
  },

  async listTopLevel(filters: CommentFilters): Promise<PaginatedResult<CommentWithAuthor>> {
    return commentRepository.listTopLevel(filters)
  },

  async listReplies(parentId: string, filters: Omit<CommentFilters, 'artwork_id'>): Promise<PaginatedResult<CommentWithAuthor>> {
    return commentRepository.listReplies(parentId, filters)
  },

  async delete(commentId: string, userId: string): Promise<void> {
    const comment = await commentRepository.getById(commentId)
    if (!comment) throw new NotFoundError('Comment')
    if (comment.user_id !== userId) throw new ForbiddenError('You can only delete your own comments')

    await commentRepository.softDelete(commentId)
  },
}