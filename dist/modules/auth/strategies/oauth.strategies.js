"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.passport = void 0;
const passport_1 = __importDefault(require("passport"));
exports.passport = passport_1.default;
const passport_google_oauth20_1 = require("passport-google-oauth20");
const passport_facebook_1 = require("passport-facebook");
const config_1 = require("../../../config");
// ─── Google ───────────────────────────────────────────────────────────────────
passport_1.default.use(new passport_google_oauth20_1.Strategy({
    clientID: config_1.config.oauth.google.clientId,
    clientSecret: config_1.config.oauth.google.clientSecret,
    callbackURL: config_1.config.oauth.google.callbackUrl,
    scope: ['email', 'profile'],
    passReqToCallback: false,
}, async (_accessToken, _refreshToken, profile, done) => {
    try {
        const email = profile.emails?.[0]?.value;
        if (!email)
            return done(new Error('No email from Google profile'));
        const oauthProfile = {
            provider: 'google',
            providerId: profile.id,
            email,
            displayName: profile.displayName ?? email.split('@')[0] ?? 'Artist',
            avatarUrl: profile.photos?.[0]?.value ?? null,
        };
        return done(null, oauthProfile);
    }
    catch (err) {
        return done(err);
    }
}));
// ─── Facebook ─────────────────────────────────────────────────────────────────
// Note: Apple auth is excluded — developer license not available.
passport_1.default.use(new passport_facebook_1.Strategy({
    clientID: config_1.config.oauth.facebook.appId,
    clientSecret: config_1.config.oauth.facebook.appSecret,
    callbackURL: config_1.config.oauth.facebook.callbackUrl,
    profileFields: ['id', 'emails', 'name', 'picture.type(large)'],
    passReqToCallback: false,
}, async (_accessToken, _refreshToken, profile, done) => {
    try {
        const email = profile.emails?.[0]?.value;
        if (!email)
            return done(new Error('No email from Facebook profile'));
        const firstName = profile.name?.givenName ?? '';
        const lastName = profile.name?.familyName ?? '';
        const displayName = ([firstName, lastName].filter(Boolean).join(' ') || email.split('@')[0]) ?? 'Artist';
        const oauthProfile = {
            provider: 'facebook',
            providerId: profile.id,
            email,
            displayName,
            avatarUrl: (profile.photos?.[0]?.value) ?? null,
        };
        return done(null, oauthProfile);
    }
    catch (err) {
        return done(err);
    }
}));
//# sourceMappingURL=oauth.strategies.js.map