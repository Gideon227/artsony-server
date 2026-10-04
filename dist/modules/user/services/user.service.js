"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.completeOnboarding = completeOnboarding;
exports.updateProfile = updateProfile;
exports.getPrivacySettings = getPrivacySettings;
exports.updatePrivacySettings = updatePrivacySettings;
exports.getInteractionPermissions = getInteractionPermissions;
const user_repository_1 = require("../../../modules/auth/repositories/user.repository");
const block_repository_1 = require("../../../modules/block/repositories/block.repository");
const privacy_util_1 = require("../../../common/utils/privacy.util");
const errors_1 = require("../../../common/errors");
// ─── Constants ────────────────────────────────────────────────────────────────
const MIN_INTERESTS = 1;
const MAX_INTERESTS = 10;
const MAX_INTEREST_LENGTH = 50;
// ─── Service ─────────────────────────────────────────────────────────────────
async function completeOnboarding({ userId, interests, ctx: _ctx, }) {
    // ── Validate ───────────────────────────────────────────────────────────────
    if (!Array.isArray(interests) || interests.length < MIN_INTERESTS) {
        throw new errors_1.ValidationError('Validation failed', {
            interests: `Please select at least ${MIN_INTERESTS} interest`,
        });
    }
    if (interests.length > MAX_INTERESTS) {
        throw new errors_1.ValidationError('Validation failed', {
            interests: `You may select at most ${MAX_INTERESTS} interests`,
        });
    }
    //   const invalid = interests.find(
    //     (i) =>
    //       typeof i !== 'string' ||
    //       i.trim().length === 0 ||
    //       i.length > MAX_INTEREST_LENGTH ||
    //       !ALLOWED_INTERESTS.has(i.toLowerCase().trim())
    //   )
    //   if (invalid !== undefined) {
    //     throw new ValidationError('Validation failed', {
    //       interests: `"${invalid}" is not a recognised interest`,
    //     })
    //   }
    // ── Persist ────────────────────────────────────────────────────────────────
    const user = await user_repository_1.userRepository.findById(userId);
    if (!user)
        throw new errors_1.NotFoundError('User');
    const deduped = [...new Set(interests.map((i) => i.toLowerCase().trim()))];
    const updated = await user_repository_1.userRepository.update(userId, {
        interests: deduped,
        onboarded: true,
    });
    return updated;
}
// ─── Profile update (username, art focus, bio, images, social links) ──────────
// Distinct from onboarding's own MAX_INTERESTS (10) — onboarding casts a
// wide net for future personalization, while "Art Focus" on the profile
// page is a small, curated set meant to be shown prominently.
const MAX_ART_FOCUS = 3;
const PROFILE_FIELD_KEYS = [
    'display_name', 'bio', 'country', 'state', 'city', 'avatar_url', 'background_url',
    'website_url', 'behance_url', 'pinterest_url', 'twitter_url', 'linkedin_url',
];
async function updateProfile({ userId, input }) {
    const current = await user_repository_1.userRepository.findByIdWithProfile(userId);
    if (!current)
        throw new errors_1.NotFoundError('User');
    // ── Username — check uniqueness only if it's actually changing ────────────
    let nextUsername = current.username;
    if (input.username !== undefined && input.username.trim() !== current.username) {
        const candidate = input.username.trim();
        const taken = await user_repository_1.userRepository.isUsernameTaken(candidate, userId);
        if (taken) {
            throw new errors_1.ValidationError('Validation failed', { username: 'This username is already taken' });
        }
        nextUsername = candidate;
    }
    // ── Art focus — capped at 3 here regardless of what onboarding allows ─────
    if (input.interests !== undefined && input.interests.length > MAX_ART_FOCUS) {
        throw new errors_1.ValidationError('Validation failed', {
            interests: `You may select at most ${MAX_ART_FOCUS} art focus tags`,
        });
    }
    const dedupedInterests = input.interests !== undefined
        ? [...new Set(input.interests.map((i) => i.toLowerCase().trim()))]
        : undefined;
    // ── users table ─────────────────────────────────────────────────────────
    const userUpdates = {};
    if (nextUsername !== current.username)
        userUpdates.username = nextUsername;
    if (dedupedInterests !== undefined)
        userUpdates.interests = dedupedInterests;
    if (Object.keys(userUpdates).length > 0) {
        await user_repository_1.userRepository.update(userId, userUpdates);
    }
    // ── profiles table ──────────────────────────────────────────────────────
    const profileFields = {};
    for (const key of PROFILE_FIELD_KEYS) {
        if (input[key] !== undefined)
            profileFields[key] = input[key];
    }
    // Upsert whenever a profile field changed, or the username changed (so
    // profiles.username — the denormalised public copy — stays in sync).
    if (Object.keys(profileFields).length > 0 || nextUsername !== current.username) {
        await user_repository_1.userRepository.upsertProfile(userId, nextUsername, profileFields);
    }
    const updated = await user_repository_1.userRepository.findByIdWithProfile(userId);
    if (!updated)
        throw new errors_1.NotFoundError('User');
    return updated;
}
// ─── Privacy preferences ────────────────────────────────────────────────────
async function getPrivacySettings(userId) {
    return user_repository_1.userRepository.getPrivacySettings(userId);
}
async function updatePrivacySettings(userId, settings) {
    return user_repository_1.userRepository.updatePrivacySettings(userId, settings);
}
async function getInteractionPermissions(requesterId, targetUserId) {
    if (requesterId === targetUserId) {
        return { can_message: true, can_comment: true, can_purchase: true };
    }
    const [blocked, settings] = await Promise.all([
        block_repository_1.blockRepository.isBlockedEitherDirection(requesterId, targetUserId),
        user_repository_1.userRepository.getPrivacySettings(targetUserId),
    ]);
    if (blocked) {
        return { can_message: false, can_comment: false, can_purchase: false };
    }
    const [can_message, can_comment, can_purchase] = await Promise.all([
        (0, privacy_util_1.isInteractionAllowed)(settings.who_can_message, requesterId, targetUserId),
        (0, privacy_util_1.isInteractionAllowed)(settings.who_can_comment, requesterId, targetUserId),
        (0, privacy_util_1.isInteractionAllowed)(settings.who_can_purchase, requesterId, targetUserId),
    ]);
    return { can_message, can_comment, can_purchase };
}
//# sourceMappingURL=user.service.js.map