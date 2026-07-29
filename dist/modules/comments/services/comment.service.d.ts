import type { CommentWithAuthor, CreateCommentInput, CommentFilters } from '../../../common/types/social.types';
import type { PaginatedResult } from '../../../common/types/commerce.types';
export declare const commentService: {
    create(input: CreateCommentInput, userId: string): Promise<CommentWithAuthor>;
    listTopLevel(filters: CommentFilters): Promise<PaginatedResult<CommentWithAuthor>>;
    listReplies(parentId: string, filters: Omit<CommentFilters, "artwork_id">): Promise<PaginatedResult<CommentWithAuthor>>;
    delete(commentId: string, userId: string): Promise<void>;
};
//# sourceMappingURL=comment.service.d.ts.map