import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import morgan from 'morgan'
import hpp from 'hpp'
import mongoSanitize from 'express-mongo-sanitize'
import path from 'path'

// Modules
import { authRouter } from './modules/auth/auth.router'
import { userRouter } from './modules/user/user.router'
import { sellerRouter } from './modules/seller/routes/seller.routes'
import { artworkRouter } from './modules/artwork/routes/artwork.routes'
import { cartRouter } from './modules/cart/routes/cart.routes'
import { orderRouter } from './modules/order/routes/order.routes'
import { deliveryRouter } from './modules/delivery/routes/delivery.routes'
import { uploadRouter } from './modules/upload/routes/upload.routes'
import { messagingRouter } from './modules/messaging/routes/messaging.router'
import { notificationRouter } from './modules/messaging/routes/notification.router'
import { physicalOrderRouter } from './modules/order/routes/physical-order.routes'
import { shippingAddressRouter } from './modules/shipping-address/routes/shipping-address.routes'
import { walletRouter } from './modules/wallet/routes/wallet.routes'
import { reviewRouter } from './modules/review/routes/review.routes'
import { analyticsRouter } from './modules/analytics/routes/analytics.routes'
import { followRouter } from './modules/follow/routes/follow.route'
import { commentRouter } from './modules/comments/routes/comment.route'

// Middleware & Config
import { errorHandler, notFoundHandler } from './middleware/error.middleware'
import { apiRateLimit } from './middleware/rate-limit.middleware'
import { requireAuth, requireOnboarded } from './middleware/auth.middleware'
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
        connectSrc: ["'self'", 'wss:'],   // wss: required for WebSocket upgrade
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
      },
    },
    hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
    noSniff: true,
    xssFilter: true,
    referrerPolicy:  { policy: 'strict-origin-when-cross-origin' },
  }))

  // ── CORS ───────────────────────────────────────────────────────────────────
  app.use(cors({
    origin: (origin, cb) => {
      if (!origin || origin === config.app.frontendUrl) return cb(null, true)
      cb(new Error('Not allowed by CORS'))
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
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

  // ── Trust proxy (Nginx / load balancer) ────────────────────────────────────
  app.set('trust proxy', 1)

  // ── Health ─────────────────────────────────────────────────────────────────
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', ts: new Date().toISOString() })
  })

  // ── Static Files ───────────────────────────────────────────────────────────
  app.use('/uploads', express.static(path.join(process.cwd(), 'public', 'uploads')))

  // ── Routes ─────────────────────────────────────────────────────────────────
  app.use('/api', apiRateLimit) // Applies rate limiting to all /api routes defined below
  
  app.use('/api/auth', authRouter)
  app.use('/api/users', userRouter)
  app.use('/api/seller-registrations', sellerRouter)
  app.use('/api/artworks', artworkRouter)
  app.use('/api/cart', cartRouter)
  app.use('/api/orders', orderRouter)
  app.use('/api/delivery', deliveryRouter)
  app.use('/api/upload', uploadRouter)
  app.use('/api/conversations', messagingRouter)
  app.use('/api/notifications', notificationRouter)
  app.use('/api/physical-orders', physicalOrderRouter)
  app.use('/api/shipping-addresses', shippingAddressRouter)
  app.use('/api/wallet', walletRouter)
  app.use('/api/reviews', reviewRouter)
  app.use('/api/analytics', analyticsRouter)
  app.use('/api/follows', followRouter)
  app.use('/api/comments', commentRouter)

  // Note: In any specific router that needs onboarding protection, import and use:
  // router.use(requireAuth, requireOnboarded)

  // ── Fallthrough ────────────────────────────────────────────────────────────
  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}