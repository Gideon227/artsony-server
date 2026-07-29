"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.moodboardRepository = void 0;
const database_1 = require("../../../config/database");
exports.moodboardRepository = {
    async create(userId, title) {
        // Cast to any to bypass the 'never' generic constraint locally
        const db = (0, database_1.supabase)();
        const { data, error } = await db
            .from('moodboards')
            .insert({ user_id: userId, title })
            .select()
            .single();
        if (error)
            throw error;
        return data;
    },
    async findByUserId(userId) {
        const db = (0, database_1.supabase)();
        const { data, error } = await db
            .from('moodboards')
            .select('id, title, created_at, updated_at, moodboard_items(count)')
            .eq('user_id', userId)
            .order('updated_at', { ascending: false });
        if (error)
            throw error;
        // PostgREST's `relation(count)` embed normally returns
        // `moodboard_items: [{ count: N }]`. Handling both that and a bare
        // object defensively since this is unverified against your actual DB —
        // log a warning once if neither shape matches so it's easy to spot.
        return (data ?? []).map((row) => {
            const embed = row.moodboard_items;
            const artworkCount = Array.isArray(embed)
                ? (embed[0]?.count ?? 0)
                : (embed?.count ?? 0);
            return {
                id: row.id,
                title: row.title,
                artwork_count: artworkCount,
                created_at: new Date(row.created_at),
                updated_at: new Date(row.updated_at),
            };
        });
    },
    async update(id, title) {
        const db = (0, database_1.supabase)();
        const { data, error } = await db
            .from('moodboards')
            .update({ title, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();
        if (error)
            throw error;
        return data;
    },
    async delete(id) {
        const db = (0, database_1.supabase)();
        const { error } = await db.from('moodboards').delete().eq('id', id);
        if (error)
            throw error;
    },
    async findById(id) {
        const db = (0, database_1.supabase)();
        const { data, error } = await db
            .from('moodboards')
            .select(`
        *,
        moodboard_items (
          artworks (*)
        )
      `)
            .eq('id', id)
            .single();
        if (error || !data)
            return null;
        // Cast data to any to bypass the spread error on 'never'
        const payload = data;
        return {
            ...payload,
            artworks: payload.moodboard_items?.map((item) => item.artworks) || [],
        };
    },
    async addArtwork(moodboardId, artworkId) {
        const db = (0, database_1.supabase)();
        const { error } = await db
            .from('moodboard_items')
            .insert({ moodboard_id: moodboardId, artwork_id: artworkId });
        if (error && error.code !== '23505')
            throw error;
    },
    async removeArtwork(moodboardId, artworkId) {
        const db = (0, database_1.supabase)();
        const { error } = await db
            .from('moodboard_items')
            .delete()
            .match({ moodboard_id: moodboardId, artwork_id: artworkId });
        if (error)
            throw error;
    }
};
//# sourceMappingURL=moodboard.repository.js.map