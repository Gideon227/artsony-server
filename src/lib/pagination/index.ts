export interface CursorPage<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export const encodeCursor = (value: string): string =>
  Buffer.from(value).toString('base64url');

export const decodeCursor = (cursor: string): string =>
  Buffer.from(cursor, 'base64url').toString('utf-8');

export const buildCursorPage = <T extends { created_at: string }>(
  items: T[],
  limit: number,
): CursorPage<T> => {
  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;
  const last = data[data.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last.created_at) : null;

  return { data, nextCursor, hasMore };
};