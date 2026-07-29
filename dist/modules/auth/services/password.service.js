"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validatePasswordComplexity = validatePasswordComplexity;
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
exports.needsRehash = needsRehash;
const argon2_1 = __importDefault(require("argon2"));
const config_1 = require("../../../config");
const errors_1 = require("../../../common/errors");
const ARGON2_OPTIONS = {
    type: argon2_1.default.argon2id, // argon2id — recommended, resists side-channel + GPU
    memoryCost: config_1.config.security.argon2.memoryCost,
    timeCost: config_1.config.security.argon2.timeCost,
    parallelism: config_1.config.security.argon2.parallelism,
};
// Minimum entropy requirements — enforced here, not in Zod schema alone
const PASSWORD_RULES = {
    minLength: 8,
    maxLength: 128,
    requireUppercase: /[A-Z]/,
    requireLowercase: /[a-z]/,
    requireDigit: /[0-9]/,
    requireSpecial: /[^A-Za-z0-9]/,
};
function validatePasswordComplexity(password) {
    const errors = [];
    if (password.length < PASSWORD_RULES.minLength)
        errors.push(`At least ${PASSWORD_RULES.minLength} characters required`);
    if (password.length > PASSWORD_RULES.maxLength)
        errors.push('Password too long');
    if (!PASSWORD_RULES.requireUppercase.test(password))
        errors.push('At least one uppercase letter required');
    if (!PASSWORD_RULES.requireLowercase.test(password))
        errors.push('At least one lowercase letter required');
    if (!PASSWORD_RULES.requireDigit.test(password))
        errors.push('At least one number required');
    if (!PASSWORD_RULES.requireSpecial.test(password))
        errors.push('At least one special character required');
    if (errors.length > 0) {
        throw new errors_1.ValidationError('Password does not meet security requirements', {
            password: errors.join('; '),
        });
    }
}
async function hashPassword(password) {
    return argon2_1.default.hash(password, ARGON2_OPTIONS);
}
// argon2.verify is already timing-safe — wrapping for explicitness
async function verifyPassword(hash, candidate) {
    try {
        return await argon2_1.default.verify(hash, candidate, ARGON2_OPTIONS);
    }
    catch {
        // Never leak whether user exists — return false on any error
        return false;
    }
}
// Checks if hash needs rehashing (e.g. after security parameter upgrade)
async function needsRehash(hash) {
    return argon2_1.default.needsRehash(hash, ARGON2_OPTIONS);
}
//# sourceMappingURL=password.service.js.map