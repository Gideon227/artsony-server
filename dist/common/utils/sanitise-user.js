"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitiseUser = sanitiseUser;
// Strips fields that must never reach the client, regardless of whether the
// input is a bare User row or the profile-joined UserWithProfile — all
// UserProfileFields are already public-safe so nothing extra needs
// stripping for the joined case.
function sanitiseUser(user) {
    const { password_hash, token_version, failed_login_attempts, locked_until, ...safe } = user;
    return safe;
}
//# sourceMappingURL=sanitise-user.js.map