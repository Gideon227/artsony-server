"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isInteractionAllowed = isInteractionAllowed;
const follow_repository_1 = require("../../modules/follow/repositories/follow.repository");
// Checks whether `actorId` is allowed to interact with `targetId` given
// targetId's privacy preference for that interaction type (messaging,
// commenting, purchasing). "FOLLOWERS" means only people who follow
// targetId are allowed — the standard "only my followers can message/
// comment on me" interpretation.
async function isInteractionAllowed(privacy, actorId, targetId) {
    if (actorId === targetId)
        return true;
    if (privacy === 'EVERYONE')
        return true;
    if (privacy === 'NO_ONE')
        return false;
    return follow_repository_1.followRepository.isFollowing(actorId, targetId);
}
//# sourceMappingURL=privacy.util.js.map