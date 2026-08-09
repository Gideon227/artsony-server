import { blockRepository } from '../repositories/block.repository'
import { ValidationError } from '@/common/errors'
import type { BlockedUser, BlockFilters } from '@/common/types/social.types'
import type { PaginatedResult } from '@/common/types/commerce.types'

export const blockService = {
  async block(blockerId: string, blockedId: string): Promise<void> {
    if (blockerId === blockedId) {
      throw new ValidationError('Validation failed', { blocked_id: 'You cannot block yourself' })
    }
    await blockRepository.block(blockerId, blockedId)
  },

  async unblock(blockerId: string, blockedId: string): Promise<void> {
    await blockRepository.unblock(blockerId, blockedId)
  },

  async isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
    return blockRepository.isBlocked(blockerId, blockedId)
  },

  async listBlocked(blockerId: string, filters: BlockFilters): Promise<PaginatedResult<BlockedUser>> {
    return blockRepository.listBlocked(blockerId, filters)
  },
}
