"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.completeOnboarding = completeOnboarding;
const user_repository_1 = require("../../../modules/auth/repositories/user.repository");
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
//# sourceMappingURL=user.service.js.map