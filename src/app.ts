import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import morgan from 'morgan'
import hpp from 'hpp'
import mongoSanitize from 'express-mongo-sanitize'
import { authRouter } from './modules/auth/auth.router'
import { userRouter } from './modules/user/user.router'
import { errorHandler, notFoundHandler } from './middleware/error.middleware'
import { apiRateLimit } from './middleware/rate-limit.middleware'
import { config } from './config'

export function createApp() {
  const app = express()

  // ── Security headers ───────────────────────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
      },
    },
    hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
    noSniff: true,
    xssFilter: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }))

  // ── CORS ───────────────────────────────────────────────────────────────────
  app.use(cors({
    origin: (origin, cb) => {
      if (!origin || origin === config.app.frontendUrl) return cb(null, true)
      cb(new Error('Not allowed by CORS'))
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86_400,
  }))

  // ── Body parsing ───────────────────────────────────────────────────────────
  app.use(express.json({ limit: '10kb' })) // Limit body size — prevent DoS
  app.use(express.urlencoded({ extended: true, limit: '10kb' }))
  app.use(cookieParser())

  // ── Request sanitisation ───────────────────────────────────────────────────
  app.use(mongoSanitize()) // Prevent NoSQL injection via $ operators
  app.use(hpp()) // Prevent HTTP parameter pollution

  // ── Logging ────────────────────────────────────────────────────────────────
  if (config.env !== 'test') {
    app.use(morgan(config.env === 'production' ? 'combined' : 'dev'))
  }

  // ── Trust proxy (Nginx / load balancer) ───────────────────────────────────
  app.set('trust proxy', 1)

  // ── Health ────────────────────────────────────────────────────────────────
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', ts: new Date().toISOString() })
  })

  // ── Routes ────────────────────────────────────────────────────────────────
  app.use('/api/auth', authRouter)
  app.use('/api/users', userRouter)
  app.use('/api', apiRateLimit)
  // In any router that needs it onboarding protection add:
  // router.use(requireAuth, requireOnboarded)

  // ── Fallthrough ───────────────────────────────────────────────────────────
  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}