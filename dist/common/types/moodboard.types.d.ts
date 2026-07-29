import type { Artwork } from './artwork.types';
export type Moodboard = {
    id: string;
    user_id: string;
    title: string;
    created_at: Date;
    updated_at: Date;
    artworks?: Artwork[];
};
export type CreateMoodboardInput = {
    title: string;
};
export type UpdateMoodboardInput = {
    title: string;
};
export type MoodboardSummary = {
    id: string;
    title: string;
    artwork_count: number;
    created_at: Date;
    updated_at: Date;
};
//# sourceMappingURL=moodboard.types.d.ts.map