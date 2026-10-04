import type { BlockedUser, BlockFilters } from '../../../common/types/social.types';
import type { PaginatedResult } from '../../../common/types/commerce.types';
export declare const blockService: {
    block(blockerId: string, blockedId: string): Promise<void>;
    unblock(blockerId: string, blockedId: string): Promise<void>;
    isBlocked(blockerId: string, blockedId: string): Promise<boolean>;
    listBlocked(blockerId: string, filters: BlockFilters): Promise<PaginatedResult<BlockedUser>>;
};
//# sourceMappingURL=block.service.d.ts.map