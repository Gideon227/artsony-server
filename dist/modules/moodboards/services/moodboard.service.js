"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMoodboard = createMoodboard;
exports.listMoodboards = listMoodboards;
exports.updateMoodboard = updateMoodboard;
exports.deleteMoodboard = deleteMoodboard;
exports.addArtworkToMoodboard = addArtworkToMoodboard;
exports.removeArtworkFromMoodboard = removeArtworkFromMoodboard;
exports.getMoodboard = getMoodboard;
const moodboard_repository_1 = require("../repositories/moodboard.repository");
const artwork_repository_1 = require("../../../modules/artwork/repositories/artwork.repository");
const errors_1 = require("../../../common/errors");
async function createMoodboard(userId, title) {
    return moodboard_repository_1.moodboardRepository.create(userId, title);
}
async function listMoodboards(userId) {
    return moodboard_repository_1.moodboardRepository.findByUserId(userId);
}
async function updateMoodboard(id, userId, title) {
    const moodboard = await moodboard_repository_1.moodboardRepository.findById(id);
    if (!moodboard)
        throw new errors_1.NotFoundError('Moodboard');
    if (moodboard.user_id !== userId)
        throw new errors_1.ForbiddenError('Not authorized to edit this moodboard');
    return moodboard_repository_1.moodboardRepository.update(id, title);
}
async function deleteMoodboard(id, userId) {
    const moodboard = await moodboard_repository_1.moodboardRepository.findById(id);
    if (!moodboard)
        throw new errors_1.NotFoundError('Moodboard');
    if (moodboard.user_id !== userId)
        throw new errors_1.ForbiddenError('Not authorized to delete this moodboard');
    await moodboard_repository_1.moodboardRepository.delete(id);
}
async function addArtworkToMoodboard(id, userId, artworkId) {
    const moodboard = await moodboard_repository_1.moodboardRepository.findById(id);
    if (!moodboard)
        throw new errors_1.NotFoundError('Moodboard');
    if (moodboard.user_id !== userId)
        throw new errors_1.ForbiddenError('Not authorized to modify this moodboard');
    const artwork = await artwork_repository_1.artworkRepository.findById(artworkId);
    if (!artwork)
        throw new errors_1.NotFoundError('Artwork');
    if (artwork.allow_moodboard_save === false) {
        throw new errors_1.ForbiddenError('This artist has disabled saving this artwork to moodboards');
    }
    await moodboard_repository_1.moodboardRepository.addArtwork(id, artworkId);
}
async function removeArtworkFromMoodboard(id, userId, artworkId) {
    const moodboard = await moodboard_repository_1.moodboardRepository.findById(id);
    if (!moodboard)
        throw new errors_1.NotFoundError('Moodboard not found');
    if (moodboard.user_id !== userId)
        throw new errors_1.ForbiddenError('Not authorized to modify this moodboard');
    await moodboard_repository_1.moodboardRepository.removeArtwork(id, artworkId);
}
async function getMoodboard(id) {
    const moodboard = await moodboard_repository_1.moodboardRepository.findById(id);
    if (!moodboard)
        throw new errors_1.NotFoundError('Moodboard');
    return moodboard;
}
//# sourceMappingURL=moodboard.service.js.map