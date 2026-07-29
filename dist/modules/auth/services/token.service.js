"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.signAccessToken = signAccessToken;
exports.verifyAccessToken = verifyAccessToken;
exports.generateRefreshToken = generateRefreshToken;
exports.hashToken = hashToken;
exports.generateSecureToken = generateSecureToken;
exports.generateOAuthState = generateOAuthState;
const jose_1 = require("jose");
const crypto_1 = require("crypto");
const config_1 = require("../../../config");
const errors_1 = require("../../../common/errors");
const encoder = new TextEncoder();
function getPrivateKey() {
    return encoder.encode(config_1.config.jwt.privateKey);
}
function getPublicKey() {
    return encoder.encode(config_1.config.jwt.publicKey);
}
// ─── Access Token (JWT, RS256-equivalent with HMAC for single-server setups) ─
// For multi-service: swap HMAC for actual RS256 keypair via jose importPKCS8/importSPKI
async function signAccessToken(payload) {
    const jwt = await new jose_1.SignJWT({
        sub: payload.userId,
        sid: payload.sessionId,
        role: payload.role,
        ver: payload.tokenVersion,
    })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(`${config_1.config.jwt.accessTokenTtl}s`)
        .setIssuer(config_1.config.jwt.issuer)
        .setAudience(config_1.config.jwt.audience)
        .sign(getPrivateKey());
    return jwt;
}
async function verifyAccessToken(token) {
    try {
        const { payload } = await (0, jose_1.jwtVerify)(token, getPublicKey(), {
            issuer: config_1.config.jwt.issuer,
            audience: config_1.config.jwt.audience,
            algorithms: ['HS256'],
        });
        return payload;
    }
    catch (err) {
        if (err instanceof Error && err.message.includes('expired')) {
            throw new errors_1.TokenExpiredError();
        }
        throw new errors_1.InvalidTokenError();
    }
}
// ─── Refresh Token (opaque, stored as SHA-256 hash) ──────────────────────────
function generateRefreshToken() {
    const raw = (0, crypto_1.randomBytes)(64).toString('base64url');
    const hash = hashToken(raw);
    return { raw, hash };
}
function hashToken(raw) {
    return (0, crypto_1.createHash)('sha256').update(raw).digest('hex');
}
// ─── Secure random tokens for reset / email verify ───────────────────────────
function generateSecureToken() {
    const raw = (0, crypto_1.randomBytes)(32).toString('base64url');
    const hash = (0, crypto_1.createHash)('sha256').update(raw).digest('hex');
    return { raw, hash };
}
// ─── OAuth state parameter (CSRF protection) ─────────────────────────────────
function generateOAuthState() {
    return (0, crypto_1.randomBytes)(32).toString('base64url');
}
//# sourceMappingURL=token.service.js.map