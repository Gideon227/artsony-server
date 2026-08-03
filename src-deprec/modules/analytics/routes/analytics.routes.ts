import { Router } from 'express'
import { requireAuth, authorize } from '@/middleware/auth.middleware'
import { apiRateLimit } from '@/middleware/rate-limit.middleware'
import {
  handleGetOverview,
  handleGetDailyEarnings,
  handleGetSalesAnalytics,
  handleGetTopArtworks,
  handleGetArtsonyScore,
  handleGetCommentAnalytics,
  overviewValidation,
  dailyEarningsValidation,
  salesAnalyticsValidation,
  topArtworksValidation,
  scoreValidation,
  commentAnalyticsValidation,
} from '../controllers/analytics.controller'

const router = Router()

// Artists view their own dashboard; admins may pass ?artist_id= for support
// (enforced in the controller's resolveSellerId, not here, since the query
// param isn't available to a route-level role gate).
router.use(requireAuth)
router.use(authorize(['ARTIST', 'ADMIN']))
router.use(apiRateLimit)

router.get('/overview',        overviewValidation,        handleGetOverview)
router.get('/earnings/daily',  dailyEarningsValidation,    handleGetDailyEarnings)
router.get('/sales',           salesAnalyticsValidation,   handleGetSalesAnalytics)
router.get('/top-artworks',    topArtworksValidation,      handleGetTopArtworks)
router.get('/score',           scoreValidation,            handleGetArtsonyScore)
router.get('/reviews',         commentAnalyticsValidation, handleGetCommentAnalytics)

export { router as analyticsRouter }
