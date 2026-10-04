import type { Moodboard, MoodboardSummary } from '../../../common/types/moodboard.types';
export declare const moodboardRepository: {
    create(userId: string, title: string): Promise<Moodboard>;
    findByUserId(userId: string): Promise<MoodboardSummary[]>;
    findCoverThumbnail(moodboardId: string, viewerId: string): Promise<string | null>;
    findArtworkIds(moodboardId: string): Promise<string[]>;
    update(id: string, title: string): Promise<Moodboard>;
    delete(id: string): Promise<void>;
    findById(id: string): Promise<Moodboard | null>;
    addArtwork(moodboardId: string, artworkId: string): Promise<void>;
    removeArtwork(moodboardId: string, artworkId: string): Promise<void>;
};
//# sourceMappingURL=moodboard.repository.d.ts.map