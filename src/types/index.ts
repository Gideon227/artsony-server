export type UserRole = 'user' | 'admin' | 'moderator';

export interface JwtPayload {
  sub: string;         // user id
  email: string;
  role: UserRole;
  iat: number;
  exp: number;
}

export interface PaginationParams {
  limit?: number;
  cursor?: string;
  page?: number;
}

export interface CursorResult<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export type SortOrder = 'asc' | 'desc';

export type ArtworkCategory =
  | 'painting'
  | 'digital'
  | 'photography'
  | 'sculpture'
  | 'illustration'
  | 'mixed_media'
  | 'print'
  | 'other';

export type ArtworkVisibility = 'public' | 'private' | 'draft';
export type OrderStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled';
export type TransactionStatus = 'pending' | 'confirmed' | 'failed' | 'expired';
export type NotificationType =
  | 'like'
  | 'comment'
  | 'reply'
  | 'follow'
  | 'sale'
  | 'order_update'
  | 'system';