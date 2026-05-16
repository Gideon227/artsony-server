import 'dotenv/config'

function require_env(key: string): string {
  const value = process.env[key]
  if (!value) throw new Error(`Missing required environment variable: ${key}`)
  return value
}

function optional_env(key: string, fallback: string): string {
  return process.env[key] ?? fallback
}

export const config = {
  env: optional_env('NODE_ENV', 'development') as 'development' | 'production' | 'test',
  port: parseInt(optional_env('PORT', '4000'), 10),

  // ── Supabase (replaces raw DB connection config) ─────────────────────────
  // SUPABASE_URL:              from Project Settings → API → Project URL
  // SUPABASE_SERVICE_ROLE_KEY: from Project Settings → API → service_role secret
  //                            ⚠ Never expose this to the client/browser
  supabase: {
    url: require_env('SUPABASE_URL'),
    serviceRoleKey: require_env('SUPABASE_SERVICE_ROLE_KEY'),
    // The anon key is only needed if you run any client-side Supabase calls
    anonKey: optional_env('SUPABASE_ANON_KEY', ''),
  },

  redis: {
    url: require_env('REDIS_URL'),
    keyPrefix: 'artsony:',
  },

  jwt: {
    privateKey: require_env('JWT_PRIVATE_KEY').replace(/\\n/g, '\n'),
    publicKey: require_env('JWT_PUBLIC_KEY').replace(/\\n/g, '\n'),
    accessTokenTtl: 15 * 60,
    refreshTokenTtl: 30 * 24 * 60 * 60,
    issuer: 'artsony',
    audience: 'artsony-client',
  },

  cookie: {
    domain: optional_env('COOKIE_DOMAIN', 'localhost'),
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
  },

  app: {
    frontendUrl: require_env('FRONTEND_URL'),
    apiUrl: require_env('API_URL'),
  },

  oauth: {
    google: {
      clientId: require_env('GOOGLE_CLIENT_ID'),
      clientSecret: require_env('GOOGLE_CLIENT_SECRET'),
      callbackUrl: require_env('GOOGLE_CALLBACK_URL'),
    },
    facebook: {
      appId: require_env('FACEBOOK_APP_ID'),
      appSecret: require_env('FACEBOOK_APP_SECRET'),
      callbackUrl: require_env('FACEBOOK_CALLBACK_URL'),
    },
    stateSecret: require_env('OAUTH_STATE_SECRET'),
  },

  email: {
    host: require_env('SMTP_HOST'),
    port: parseInt(optional_env('SMTP_PORT', '587'), 10),
    secure: process.env.NODE_ENV === 'production',
    user: require_env('SMTP_USER'),
    password: require_env('SMTP_PASSWORD'),
    from: optional_env('SMTP_FROM', 'noreply@artsony.com'),
  },

  security: {
    argon2: {
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    },
    loginMaxAttempts: 5,
    loginLockoutMinutes: 30,
    resetTokenExpiryMinutes: 15,
    resetMaxAttempts: 5,
    rateLimits: {
      auth: { windowMs: 15 * 60 * 1000, max: 10 },
      api: { windowMs: 60 * 1000, max: 100 },
      passwordReset: { windowMs: 60 * 60 * 1000, max: 3 },
    },
  },

  queue: {
    emailQueue: 'artsony:queue:email',
    deletionQueue: 'artsony:queue:account-deletion',
    accountDeletionGraceDays: 30,
  },
} as const

export type Config = typeof config
