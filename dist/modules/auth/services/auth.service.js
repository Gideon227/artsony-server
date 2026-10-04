"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = register;
exports.login = login;
exports.refreshTokens = refreshTokens;
exports.logout = logout;
exports.forgotPassword = forgotPassword;
exports.resetPassword = resetPassword;
exports.handleOAuthProfile = handleOAuthProfile;
exports.deleteAccount = deleteAccount;
exports.changePassword = changePassword;
exports.deactivateAccount = deactivateAccount;
const config_1 = require("../../../config");
const user_repository_1 = require("../repositories/user.repository");
const session_repository_1 = require("../repositories/session.repository");
const reset_token_repository_1 = require("../repositories/reset-token.repository");
const audit_repository_1 = require("../repositories/audit.repository");
const email_service_1 = require("../../email/email.service");
const account_purge_job_1 = require("../jobs/account-purge.job");
const password_service_1 = require("./password.service");
const token_service_1 = require("./token.service");
const redis_client_1 = require("../../redis/redis.client");
const errors_1 = require("../../../common/errors");
// ─── Register ─────────────────────────────────────────────────────────────────
async function register(input) {
    (0, password_service_1.validatePasswordComplexity)(input.password);
    const existing = await user_repository_1.userRepository.findByEmail(input.email);
    if (existing) {
        await (0, password_service_1.hashPassword)(input.password);
        throw new errors_1.ConflictError('An account with this email already exists');
    }
    const passwordHash = await (0, password_service_1.hashPassword)(input.password);
    const user = await user_repository_1.userRepository.create({
        username: input.username,
        email: input.email,
        password_hash: passwordHash,
        provider: 'local',
    });
    const tokens = await issueTokenPair(user, input.ctx);
    email_service_1.emailService.sendWelcomeEmail({ to: user['email'], displayName: input.username }).catch((err) => console.error('[Auth] Welcome email failed:', err));
    audit_repository_1.auditRepository.log(buildAudit('AUTH_REGISTER', user['id'], input.ctx));
    return { user, tokens };
}
// ─── Login ────────────────────────────────────────────────────────────────────
async function login(input) {
    const lockKey = redis_client_1.RedisKeys.lockout(input.email);
    const isLocked = await (0, redis_client_1.redisGet)(lockKey);
    if (isLocked) {
        throw new errors_1.TooManyRequestsError('Account is temporarily locked. Please try again later.');
    }
    const user = await user_repository_1.userRepository.findByEmail(input.email);
    const dummyHash = '$argon2id$v=19$m=65536,t=3,p=4$placeholder$placeholder';
    const candidateHash = user ? user['password_hash'] ?? dummyHash : dummyHash;
    const isValid = await (0, password_service_1.verifyPassword)(candidateHash, input.password);
    if (!user || !isValid) {
        await handleFailedLogin(input.email, user ?? null, input.ctx);
        throw new errors_1.UnauthorizedError('Invalid email or password');
    }
    if (user['status'] === 'SUSPENDED') {
        throw new errors_1.UnauthorizedError('Account suspended. Contact support.');
    }
    if (user['status'] === 'DELETED') {
        throw new errors_1.UnauthorizedError('Account not found');
    }
    // Deactivation is self-service and immediately reversible — unlike
    // SUSPENDED/DELETED, a successful login (meaning the password check
    // above already passed) reactivates the account automatically rather
    // than blocking sign-in.
    if (user['status'] === 'DEACTIVATED') {
        await user_repository_1.userRepository.update(user['id'], { status: 'ACTIVE' });
        user['status'] = 'ACTIVE';
        audit_repository_1.auditRepository.log(buildAudit('AUTH_ACCOUNT_REACTIVATED', user['id'], input.ctx));
    }
    if (user['locked_until'] && user['locked_until'] > new Date()) {
        throw new errors_1.AccountLockedError(user['locked_until']);
    }
    if (user['password_hash'] && await (0, password_service_1.needsRehash)(user['password_hash'])) {
        const newHash = await (0, password_service_1.hashPassword)(input.password);
        await user_repository_1.userRepository.update(user['id'], { password_hash: newHash });
    }
    await user_repository_1.userRepository.recordLoginAttempt(user['id'], true);
    const tokens = await issueTokenPair(user, input.ctx);
    audit_repository_1.auditRepository.log(buildAudit('AUTH_LOGIN', user['id'], input.ctx));
    return { user, tokens };
}
async function handleFailedLogin(email, user, ctx) {
    const attemptsKey = redis_client_1.RedisKeys.loginAttempts(email);
    const windowSeconds = 15 * 60;
    const attempts = await (0, redis_client_1.redisIncr)(attemptsKey, windowSeconds);
    if (user) {
        await user_repository_1.userRepository.recordLoginAttempt(user['id'], false);
    }
    audit_repository_1.auditRepository.log(buildAudit('AUTH_LOGIN_FAILED', user ? user['id'] : null, ctx, { email, attempts }));
    if (attempts >= config_1.config.security.loginMaxAttempts) {
        const lockDurationSeconds = config_1.config.security.loginLockoutMinutes * 60;
        await (0, redis_client_1.redisSet)(redis_client_1.RedisKeys.lockout(email), '1', lockDurationSeconds);
        if (user) {
            const lockedUntil = new Date(Date.now() + lockDurationSeconds * 1000);
            await user_repository_1.userRepository.lockAccount(user['id'], lockedUntil);
        }
        audit_repository_1.auditRepository.log(buildAudit('AUTH_ACCOUNT_LOCKED', user ? user['id'] : null, ctx, { email, attempts }));
    }
}
// ─── Refresh Token ────────────────────────────────────────────────────────────
async function refreshTokens(input) {
    const incomingHash = (0, token_service_1.hashToken)(input.rawRefreshToken);
    const blacklisted = await (0, redis_client_1.redisGet)(redis_client_1.RedisKeys.rtBlacklist(incomingHash));
    if (blacklisted) {
        const session = await session_repository_1.sessionRepository.findByTokenHash(incomingHash);
        if (session) {
            await session_repository_1.sessionRepository.revokeAllForUser(session['user_id']);
            audit_repository_1.auditRepository.log(buildAudit('AUTH_SUSPICIOUS_REFRESH', session['user_id'], input.ctx, {
                reason: 'blacklisted_token_reuse',
            }));
        }
        throw new errors_1.InvalidTokenError();
    }
    const session = await session_repository_1.sessionRepository.findByTokenHash(incomingHash);
    if (!session)
        throw new errors_1.InvalidTokenError();
    const user = await user_repository_1.userRepository.findById(session['user_id']);
    if (!user || user['status'] !== 'ACTIVE')
        throw new errors_1.UnauthorizedError();
    const { raw: newRaw, hash: newHash } = (0, token_service_1.generateRefreshToken)();
    await (0, redis_client_1.redisSet)(redis_client_1.RedisKeys.rtBlacklist(incomingHash), '1', config_1.config.jwt.refreshTokenTtl);
    const newSession = await session_repository_1.sessionRepository.rotate({
        oldSessionId: session['id'],
        userId: user['id'],
        newTokenHash: newHash,
        userAgent: input.ctx.userAgent,
        ipAddress: input.ctx.ipAddress,
    });
    const accessToken = await (0, token_service_1.signAccessToken)({
        userId: user['id'],
        sessionId: newSession['id'],
        role: user['role'],
        tokenVersion: user['token_version'],
    });
    audit_repository_1.auditRepository.log(buildAudit('AUTH_REFRESH', user['id'], input.ctx));
    return { accessToken, refreshToken: newRaw, sessionId: newSession['id'] };
}
// ─── Logout ───────────────────────────────────────────────────────────────────
async function logout(input) {
    const hash = (0, token_service_1.hashToken)(input.rawRefreshToken);
    const session = await session_repository_1.sessionRepository.findByTokenHash(hash);
    if (session) {
        await session_repository_1.sessionRepository.revokeById(session['id']);
        await (0, redis_client_1.redisSet)(redis_client_1.RedisKeys.rtBlacklist(hash), '1', config_1.config.jwt.refreshTokenTtl);
    }
    audit_repository_1.auditRepository.log(buildAudit('AUTH_LOGOUT', input.userId, input.ctx));
}
// ─── Forgot Password ──────────────────────────────────────────────────────────
async function forgotPassword(input) {
    const attemptsKey = redis_client_1.RedisKeys.resetAttempts(input.email);
    const attempts = await (0, redis_client_1.redisIncr)(attemptsKey, 3600);
    if (attempts > config_1.config.security.resetMaxAttempts) {
        throw new errors_1.TooManyRequestsError('Too many reset requests. Try again in an hour.');
    }
    const user = await user_repository_1.userRepository.findByEmail(input.email);
    if (!user)
        return;
    const { raw, hash } = (0, token_service_1.generateSecureToken)();
    await reset_token_repository_1.resetTokenRepository.create({
        userId: user['id'],
        tokenHash: hash,
        email: input.email,
    });
    const resetUrl = `${config_1.config.app.frontendUrl}/reset-password?token=${raw}&email=${encodeURIComponent(input.email)}`;
    try {
        await email_service_1.emailService.sendPasswordResetEmail({
            to: input.email,
            resetUrl,
            expiryMinutes: config_1.config.security.resetTokenExpiryMinutes,
        });
    }
    catch (err) {
        // The reset token is already created and valid — a queueing hiccup here
        // shouldn't fail (or hang) the request, and staying silent here also
        // preserves the same response shape whether or not the account exists.
        console.error('[forgotPassword] Failed to enqueue reset email:', err.message);
    }
    audit_repository_1.auditRepository.log(buildAudit('AUTH_PASSWORD_RESET_REQUEST', user['id'], input.ctx, { email: input.email }));
}
// ─── Reset Password ───────────────────────────────────────────────────────────
async function resetPassword(input) {
    (0, password_service_1.validatePasswordComplexity)(input.newPassword);
    const tokenHash = (0, token_service_1.hashToken)(input.rawToken);
    const record = await reset_token_repository_1.resetTokenRepository.findValid({
        tokenHash,
        email: input.email,
    });
    if (!record) {
        await reset_token_repository_1.resetTokenRepository.incrementAttempts(tokenHash);
        throw new errors_1.InvalidTokenError();
    }
    if (record['reset_attempts'] >= config_1.config.security.resetMaxAttempts) {
        throw new errors_1.TooManyRequestsError('Reset token attempt limit exceeded.');
    }
    const newHash = await (0, password_service_1.hashPassword)(input.newPassword);
    await Promise.all([
        user_repository_1.userRepository.update(record['user_id'], { password_hash: newHash }),
        user_repository_1.userRepository.incrementTokenVersion(record['user_id']),
        reset_token_repository_1.resetTokenRepository.markUsed(record['id']),
        session_repository_1.sessionRepository.revokeAllForUser(record['user_id']),
    ]);
    audit_repository_1.auditRepository.log(buildAudit('AUTH_PASSWORD_RESET_SUCCESS', record['user_id'], input.ctx));
}
// ─── OAuth Login / Register ───────────────────────────────────────────────────
async function handleOAuthProfile(input) {
    const { profile } = input;
    let user = await user_repository_1.userRepository.findByProviderId(profile.provider, profile.providerId);
    if (!user) {
        const byEmail = await user_repository_1.userRepository.findByEmail(profile.email);
        if (byEmail) {
            user = await user_repository_1.userRepository.update(byEmail['id'], {
                provider_id: profile.providerId,
                is_email_verified: true,
            });
        }
    }
    const isNew = !user;
    if (!user) {
        user = await user_repository_1.userRepository.create({
            username: profile.displayName,
            email: profile.email,
            provider: profile.provider,
            provider_id: profile.providerId,
        });
        email_service_1.emailService.sendWelcomeEmail({
            to: profile.email,
            displayName: profile.displayName,
        }).catch((err) => console.error('[Auth] OAuth welcome email failed:', err));
    }
    if (user['status'] !== 'ACTIVE')
        throw new errors_1.UnauthorizedError('Account unavailable');
    const tokens = await issueTokenPair(user, input.ctx);
    audit_repository_1.auditRepository.log(buildAudit('AUTH_OAUTH_LOGIN', user['id'], input.ctx, { provider: profile.provider, isNew }));
    return { user, tokens, isNew };
}
// ─── Delete Account ───────────────────────────────────────────────────────────
async function deleteAccount(input) {
    const user = await user_repository_1.userRepository.findById(input.userId);
    if (!user)
        throw new errors_1.NotFoundError('User');
    if (user['provider'] === 'local') {
        if (!input.password)
            throw new errors_1.ValidationError('Password confirmation required');
        if (!user['password_hash'])
            throw new errors_1.UnauthorizedError();
        const valid = await (0, password_service_1.verifyPassword)(user['password_hash'], input.password);
        if (!valid)
            throw new errors_1.UnauthorizedError('Incorrect password');
    }
    await Promise.all([
        user_repository_1.userRepository.softDelete(user['id']),
        session_repository_1.sessionRepository.revokeAllForUser(user['id']),
        user_repository_1.userRepository.incrementTokenVersion(user['id']),
    ]);
    const scheduledAt = new Date(Date.now() + config_1.config.queue.accountDeletionGraceDays * 24 * 60 * 60 * 1000);
    // Actually enforce the grace period promised below — previously this was
    // never scheduled anywhere, so accounts stayed soft-deleted indefinitely.
    await (0, account_purge_job_1.scheduleAccountPurge)(user['id']);
    await email_service_1.emailService.sendAccountDeletionConfirmation({
        to: user['email'],
        displayName: user['email'],
        scheduledAt,
    });
    audit_repository_1.auditRepository.log(buildAudit('AUTH_ACCOUNT_DELETE_INITIATED', user['id'], input.ctx, { scheduledAt }));
}
// ─── Change Password (while signed in) ─────────────────────────────────────
// Distinct from resetPassword — that flow is for a locked-out user via an
// emailed token; this is for a signed-in user who knows their current
// password. Revokes all sessions and bumps token_version on success,
// including the session making this request — the caller must expect to
// need a fresh login afterward, same security posture as resetPassword.
async function changePassword(input) {
    const user = await user_repository_1.userRepository.findById(input.userId);
    if (!user)
        throw new errors_1.NotFoundError('User');
    if (user['provider'] !== 'local' || !user['password_hash']) {
        throw new errors_1.ValidationError('Validation failed', {
            password: 'This account signs in via a social provider and has no password to change',
        });
    }
    const valid = await (0, password_service_1.verifyPassword)(user['password_hash'], input.currentPassword);
    if (!valid)
        throw new errors_1.UnauthorizedError('Current password is incorrect');
    (0, password_service_1.validatePasswordComplexity)(input.newPassword);
    const newHash = await (0, password_service_1.hashPassword)(input.newPassword);
    await Promise.all([
        user_repository_1.userRepository.update(user['id'], { password_hash: newHash }),
        user_repository_1.userRepository.incrementTokenVersion(user['id']),
        session_repository_1.sessionRepository.revokeAllForUser(user['id']),
    ]);
    audit_repository_1.auditRepository.log(buildAudit('AUTH_PASSWORD_CHANGED', user['id'], input.ctx));
}
// ─── Deactivate Account ─────────────────────────────────────────────────────
// Self-service and immediately reversible by logging back in (see the
// DEACTIVATED branch in login() above) — distinct from deleteAccount,
// which starts an irreversible-after-the-grace-period purge.
async function deactivateAccount(input) {
    const user = await user_repository_1.userRepository.findById(input.userId);
    if (!user)
        throw new errors_1.NotFoundError('User');
    if (user['provider'] === 'local') {
        if (!input.password)
            throw new errors_1.ValidationError('Password confirmation required');
        if (!user['password_hash'])
            throw new errors_1.UnauthorizedError();
        const valid = await (0, password_service_1.verifyPassword)(user['password_hash'], input.password);
        if (!valid)
            throw new errors_1.UnauthorizedError('Incorrect password');
    }
    await Promise.all([
        user_repository_1.userRepository.update(user['id'], { status: 'DEACTIVATED' }),
        session_repository_1.sessionRepository.revokeAllForUser(user['id']),
        user_repository_1.userRepository.incrementTokenVersion(user['id']),
    ]);
    audit_repository_1.auditRepository.log(buildAudit('AUTH_ACCOUNT_DEACTIVATED', user['id'], input.ctx));
}
// ─── Internal helpers ─────────────────────────────────────────────────────────
async function issueTokenPair(user, ctx) {
    const { raw, hash } = (0, token_service_1.generateRefreshToken)();
    const session = await session_repository_1.sessionRepository.create({
        userId: user['id'],
        refreshTokenHash: hash,
        userAgent: ctx.userAgent,
        ipAddress: ctx.ipAddress,
    });
    const accessToken = await (0, token_service_1.signAccessToken)({
        userId: user['id'],
        sessionId: session['id'],
        role: user['role'],
        tokenVersion: user['token_version'],
    });
    return { accessToken, refreshToken: raw, sessionId: session['id'] };
}
/**
 * Safely constructs the audit payload without explicitly setting 'undefined' keys,
 * solving strict exactOptionalPropertyTypes compiler errors.
 */
function buildAudit(action, userId, ctx, metadata) {
    const payload = { action };
    if (userId)
        payload['userId'] = userId;
    if (ctx.ipAddress)
        payload['ipAddress'] = ctx.ipAddress;
    if (ctx.userAgent)
        payload['userAgent'] = ctx.userAgent;
    if (metadata)
        payload['metadata'] = metadata;
    return payload;
}
//# sourceMappingURL=auth.service.js.map