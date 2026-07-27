import { Router } from 'express'
import { requireAuth } from '@/middleware/auth.middleware'
import { apiRateLimit } from '@/middleware/rate-limit.middleware'
import {
  handleCreateComment,
  handleListComments,
  handleListReplies,
  handleDeleteComment,
  createCommentValidation,
  listCommentsValidation,
  listRepliesValidation,
  deleteCommentValidation,
} from '../controllers/comment.controller'

const router = Router()

router.use(apiRateLimit)

// Public — anyone can read comments on an artwork.
router.get('/artwork/:artworkId', listCommentsValidation, handleListComments)
router.get('/:commentId/replies', listRepliesValidation, handleListReplies)

// Authenticated
router.post('/', requireAuth, createCommentValidation, handleCreateComment)
router.delete('/:commentId', requireAuth, deleteCommentValidation, handleDeleteComment)

export { router as commentRouter }