import type { Artwork, CreateArtworkInput, UpdateArtworkInput, ArtworkFilters, PaginatedArtworks, FeaturedArtwork } from '../../../common/types/artwork.types';
import type { UserRole } from '../../../common/types';
export declare function createArtwork(input: CreateArtworkInput, creatorId: string, requesterRole: UserRole): Promise<Artwork>;
export declare function getArtworkById(id: string, requesterId?: string): Promise<Artwork>;
export declare function getArtworkBySlug(slug: string, requesterId?: string): Promise<Artwork>;
export declare function getFeaturedArtworks(limit?: number): Promise<FeaturedArtwork[]>;
export declare function getSizeLabels(): Promise<{
    label: string;
    artwork_count: number;
}[]>;
export declare function getTopPicks(limit?: number, period?: 'all' | 'week', listingType?: 'MARKETPLACE' | 'PORTFOLIO'): Promise<Artwork[]>;
export declare function getLocations(): Promise<{
    label: string;
    artwork_count: number;
}[]>;
export declare function listArtworks(filters: ArtworkFilters, requesterId?: string, requesterRole?: UserRole): Promise<PaginatedArtworks>;
export type FeedMode = 'for_you' | 'following' | 'new' | 'trending' | 'newbies';
export declare function getFeed(mode: FeedMode, filters: ArtworkFilters, requesterId?: string): Promise<PaginatedArtworks>;
export declare function updateArtwork(id: string, input: UpdateArtworkInput, requesterId: string, requesterRole: UserRole): Promise<Artwork>;
export declare function publishArtwork(id: string, requesterId: string, requesterRole: UserRole): Promise<Artwork>;
export declare function archiveArtwork(id: string, requesterId: string, requesterRole: UserRole): Promise<Artwork>;
export declare function deleteArtwork(id: string, requesterId: string, requesterRole: UserRole): Promise<void>;
export declare function flagArtwork(id: string, reviewerId: string, notes: string, moderationStatus: Artwork['moderation_status']): Promise<Artwork>;
export declare function trackView(artworkId: string, identity: string): Promise<void>;
export declare function toggleLike(artworkId: string, userId: string): Promise<{
    liked: boolean;
    like_count: number;
}>;
export declare function enforceIsPurchasable(artwork: Artwork): void;
export declare function getPurchasableArtwork(id: string): Promise<Artwork>;
export declare function toggleSave(artworkId: string, userId: string): Promise<{
    saved: boolean;
    save_count: number;
}>;
export declare function reportArtwork(artworkId: string, reporterId: string, reason: string, notes?: string): Promise<void>;
//# sourceMappingURL=artwork.service.d.ts.map