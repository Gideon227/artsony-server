import 'dotenv/config'

function require_env(key: string): string {
  const value = process.env[key]
  if (!value) throw new Error(`Missing required environment variable: ${key}`)
  return value
}

function optional_env(key: string, fallback: string): string {
  return process.env[key] ?? fallback
}

// ── Environment Constants (Fixes noPropertyAccessFromIndexSignature) ─────────
const currentEnv = (process.env['NODE_ENV'] || 'development') as 'development' | 'production' | 'test'
const isProduction = currentEnv === 'production'

export const config = {
  env: currentEnv,
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
    secure: isProduction,
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
    secure: isProduction,
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
      auth: { windowMs: 15 * 60 * 1000, max: 30 },
      api: { windowMs: 60 * 1000, max: 100 },
      passwordReset: { windowMs: 60 * 60 * 1000, max: 3 },
    },
  },

  queue: {
    emailQueue: 'artsony:queue:email',
    deletionQueue: 'artsony:queue:account-deletion',
    accountDeletionGraceDays: 30,
  },

  // ── Cloudinary (artwork/profile media storage) ────────────────────────────
  // Previously read directly from process.env in cloudinary.service.ts with
  // only a console.warn on missing vars — a misconfigured production
  // deployment would start up fine and only fail (or silently misbehave)
  // the first time someone uploaded a file. Routed through require_env()
  // here so that's a startup crash instead, matching every other external
  // integration in this file.
  cloudinary: {
    cloudName: require_env('CLOUDINARY_CLOUD_NAME'),
    apiKey:    require_env('CLOUDINARY_API_KEY'),
    apiSecret: require_env('CLOUDINARY_API_SECRET'),
  },

  // ── Wallet / payouts ──────────────────────────────────────────────────────
  // No PSP is wired up yet — withdrawal_requests are fulfilled manually by an
  // admin. holdPeriodDays is the "clearing" window between a physical item
  // being marked DELIVERED and its sale proceeds becoming withdrawable.
  wallet: {
    holdPeriodDays: parseInt(optional_env('WALLET_HOLD_PERIOD_DAYS', '3'), 10),
    minWithdrawalAmount: parseFloat(optional_env('WALLET_MIN_WITHDRAWAL_AMOUNT', '20')),
  },

    // ── IP geolocation (sign-up / login) ──────────────────────────────────────
  // Country is detected from the connecting IP and saved on the profile. None
  // of this is required: with no provider configured, detection simply no-ops.
  geo: {
    enabled: optional_env('GEO_ENABLED', 'true') === 'true',
    // IPinfo Lite token (free, country-level). https://ipinfo.io/lite
    ipinfoToken: optional_env('IPINFO_TOKEN', ''),
    // Cloudflare only — enable ONLY if the server is reachable exclusively through
    // Cloudflare, otherwise clients could send these headers themselves.
    trustCdnHeaders: optional_env('GEO_TRUST_CDN_HEADERS', 'false') === 'true',
    trustCloudflareIp: optional_env('GEO_TRUST_CF_CONNECTING_IP', 'false') === 'true',
    // Also auto-fill the public state/city (needs a source that provides them,
    // e.g. Cloudflare's location headers). Off by default: they're shown
    // publicly and IP-derived cities are the least reliable part of a lookup.
    autofillRegion: optional_env('GEO_AUTOFILL_REGION', 'false') === 'true',
    lookupTimeoutMs: parseInt(optional_env('GEO_LOOKUP_TIMEOUT_MS', '1500'), 10),
    // Dev only: pretend requests come from this public IP (localhost can't be located).
    devIp: isProduction ? '' : optional_env('GEO_DEV_IP', ''),
    // Logs each lookup, including the IP — use briefly to verify proxy setup.
    debug: optional_env('GEO_DEBUG', 'false') === 'true',
  },
} as const

export type Config = typeof config