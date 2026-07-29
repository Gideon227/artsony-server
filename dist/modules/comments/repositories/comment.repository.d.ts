import type { Comment, CommentWithAuthor, CreateCommentInput, CommentFilters } from '../../../common/types/social.types';
import type { PaginatedResult } from '../../../common/types/commerce.types';
export declare const commentRepository: {
    create(input: CreateCommentInput & {
        userId: string;
    }): Promise<CommentWithAuthor>;
    getById(id: string): Promise<Comment | undefined>;
    listTopLevel(filters: CommentFilters): Promise<PaginatedResult<CommentWithAuthor>>;
    listReplies(parentId: string, filters: Omit<CommentFilters, "artwork_id">): Promise<PaginatedResult<CommentWithAuthor>>;
    softDelete(id: string): Promise<void>;
};
//# sourceMappingURL=comment.repository.d.ts.map