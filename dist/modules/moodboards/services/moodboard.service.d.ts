import type { Moodboard, MoodboardSummary } from '../../../common/types/moodboard.types';
export declare function createMoodboard(userId: string, title: string): Promise<Moodboard>;
export declare function listMoodboards(userId: string): Promise<MoodboardSummary[]>;
export declare function updateMoodboard(id: string, userId: string, title: string): Promise<Moodboard>;
export declare function deleteMoodboard(id: string, userId: string): Promise<void>;
export declare function addArtworkToMoodboard(id: string, userId: string, artworkId: string): Promise<void>;
export declare function removeArtworkFromMoodboard(id: string, userId: string, artworkId: string): Promise<void>;
export declare function getMoodboard(id: string): Promise<Moodboard>;
//# sourceMappingURL=moodboard.service.d.ts.map