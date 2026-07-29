import type { FollowUser, FollowFilters } from '../../../common/types/social.types';
import type { PaginatedResult } from '../../../common/types/commerce.types';
export declare const followRepository: {
    toggle(followerId: string, followingId: string): Promise<boolean>;
    isFollowing(followerId: string, followingId: string): Promise<boolean>;
    getFollowedIds(followerId: string): Promise<string[]>;
    listFollowers(userId: string, filters: FollowFilters): Promise<PaginatedResult<FollowUser>>;
    listFollowing(userId: string, filters: FollowFilters): Promise<PaginatedResult<FollowUser>>;
};
//# sourceMappingURL=follow.repository.d.ts.map