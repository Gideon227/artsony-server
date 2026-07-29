import type { Artwork, ArtworkFilters, PaginatedArtworks, CreateArtworkInput, UpdateArtworkInput, FeaturedArtwork } from '../../../common/types/artwork.types';
export declare const artworkRepository: {
    create(input: CreateArtworkInput, creatorId: string, slug: string): Promise<Artwork>;
    findById(id: string, requesterId?: string): Promise<Artwork | undefined>;
    findBySlug(slug: string, requesterId?: string): Promise<Artwork | undefined>;
    update(id: string, input: UpdateArtworkInput): Promise<Artwork>;
    updateStatus(id: string, status: Artwork["status"], moderationStatus?: Artwork["moderation_status"]): Promise<Artwork>;
    softDelete(id: string): Promise<void>;
    generateSlug(title: string, creatorId: string): Promise<string>;
    incrementViewCount(id: string): Promise<void>;
    toggleLike(artworkId: string, userId: string): Promise<{
        liked: boolean;
        like_count: number;
    }>;
    hasLiked(artworkId: string, userId: string): Promise<boolean>;
    list(filters: ArtworkFilters): Promise<PaginatedArtworks>;
    getEngagedCategories(userId: string, limit?: number): Promise<string[]>;
    getRecentArtistIds(sinceDays?: number, limit?: number): Promise<string[]>;
    getCreatorIdsByLocation(locationQuery: string): Promise<string[]>;
    getDistinctSizeLabels(): Promise<{
        label: string;
        artwork_count: number;
    }[]>;
    getArtworkIdsBySize(sizeLabel: string): Promise<string[]>;
    findManyByIdsOrdered(ids: string[]): Promise<Artwork[]>;
    getDistinctLocations(): Promise<{
        label: string;
        artwork_count: number;
    }[]>;
    getTopPicks(limit?: number, listingType?: "MARKETPLACE" | "PORTFOLIO"): Promise<Artwork[]>;
    findTopPerformers(limit: number): Promise<FeaturedArtwork[]>;
    findRecentCandidates(sinceIso: string, limit: number, listingType?: "MARKETPLACE" | "PORTFOLIO"): Promise<FeaturedArtwork[]>;
    findFallback(excludeIds: string[], limit: number): Promise<FeaturedArtwork[]>;
    flag(id: string, reviewerId: string, notes: string, moderationStatus: Artwork["moderation_status"]): Promise<Artwork>;
    findPurchasableById(id: string): Promise<Artwork | undefined>;
    hasActiveOrders(artworkId: string): Promise<boolean>;
    reserveStock(artworkId: string, quantity: number, variantOptionId?: string): Promise<boolean>;
    releaseStock(artworkId: string, quantity: number, variantOptionId?: string): Promise<void>;
    findSaveStatus(artworkId: string, userId: string): Promise<boolean>;
    toggleSave(artworkId: string, userId: string): Promise<{
        saved: boolean;
        save_count: number;
    }>;
    createReport(artworkId: string, reporterId: string, reason: string, notes?: string): Promise<void>;
};
//# sourceMappingURL=artwork.repository.d.ts.map