import 'express-async-errors';

import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import hpp from 'hpp';

import { config } from './config/index.js';
import { errorMiddleware } from './middleware/error.middleware.js';
import { globalRateLimit } from './middleware/rateLimit.middleware.js';
import { requestLogger } from './middleware/logging.middleware.js';
import { sanitize } from './middleware/sanitize.middleware.js';

import { healthRoutes } from './modules/health/health.routes.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { usersRoutes } from './modules/users/users.routes.js';
import { artworksRoutes } from './modules/artworks/artworks.routes.js';
import { feedRoutes } from './modules/feed/feed.routes.js';
import { socialRoutes } from './modules/social/social.routes.js';
import { shopRoutes } from './modules/shop/shop.routes.js';
import { walletRoutes } from './modules/wallet/wallet.routes.js';
import { notificationsRoutes } from './modules/notifications/notifications.routes.js';

export const createApp = (): express.Application => {
  const app = express();

  // Trust proxy for accurate IP in rate limiting
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // Security headers
  app.use(helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', '*.supabase.co'],
      },
    },
  }));

  // CORS
  app.use(cors({
    origin: config.CORS_ORIGIN.split(','),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  }));

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // HTTP parameter pollution prevention
  app.use(hpp());

  // Compression
  app.use(compression());

  // Logging
  app.use(requestLogger);

  // Input sanitization
  app.use(sanitize);

  // Global rate limiting
  app.use(globalRateLimit);

  // Health + readiness (no versioning, no auth)
  app.use('/health', healthRoutes);

  // Versioned API routes
  const v1 = express.Router();
  v1.use('/auth', authRoutes);
  v1.use('/users', usersRoutes);
  v1.use('/artworks', artworksRoutes);
  v1.use('/feed', feedRoutes);
  v1.use('/social', socialRoutes);
  v1.use('/shop', shopRoutes);
  v1.use('/wallet', walletRoutes);
  v1.use('/notifications', notificationsRoutes);

  app.use(`/api/${config.API_VERSION}`, v1);

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  // Global error handler — must be last
  app.use(errorMiddleware);

  return app;
};