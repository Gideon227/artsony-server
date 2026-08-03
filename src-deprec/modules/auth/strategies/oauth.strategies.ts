import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import { Strategy as FacebookStrategy } from 'passport-facebook'
import { config } from '@/config'
import type { OAuthProfile } from '@/common/types'

// ─── Google ───────────────────────────────────────────────────────────────────

passport.use(
  new GoogleStrategy(
    {
      clientID: config.oauth.google.clientId,
      clientSecret: config.oauth.google.clientSecret,
      callbackURL: config.oauth.google.callbackUrl,
      scope: ['email', 'profile'],
      passReqToCallback: false,
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value
        if (!email) return done(new Error('No email from Google profile'))

        const oauthProfile: OAuthProfile = {
          provider: 'google',
          providerId: profile.id,
          email,
          displayName: profile.displayName ?? email.split('@')[0] ?? 'Artist',
          avatarUrl: profile.photos?.[0]?.value ?? null,
        }

        return done(null, oauthProfile)
      } catch (err) {
        return done(err as Error)
      }
    }
  )
)

// ─── Facebook ─────────────────────────────────────────────────────────────────
// Note: Apple auth is excluded — developer license not available.

passport.use(
  new FacebookStrategy(
    {
      clientID: config.oauth.facebook.appId,
      clientSecret: config.oauth.facebook.appSecret,
      callbackURL: config.oauth.facebook.callbackUrl,
      profileFields: ['id', 'emails', 'name', 'picture.type(large)'],
      passReqToCallback: false,
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value
        if (!email) return done(new Error('No email from Facebook profile'))

        const firstName = profile.name?.givenName ?? ''
        const lastName = profile.name?.familyName ?? ''
        const displayName =
          ([firstName, lastName].filter(Boolean).join(' ') || email.split('@')[0] )?? 'Artist'

        const oauthProfile: OAuthProfile = {
          provider: 'facebook',
          providerId: profile.id,
          email,
          displayName,
          avatarUrl:
            (profile.photos?.[0]?.value) ?? null,
        }

        return done(null, oauthProfile)
      } catch (err) {
        return done(err as Error)
      }
    }
  )
)

export { passport }
