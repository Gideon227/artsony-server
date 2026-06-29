import { Router } from 'express'
import { requireAuth } from '@/middleware/auth.middleware'
import { apiRateLimit } from '@/middleware/rate-limit.middleware'
import {
  handleCreateConversation,
  handleListConversations,
  handleGetConversation,
  handleUpdateConversation,
  handleMuteConversation,
  handleLeaveConversation,
  handleSearchConversations,
  createConversationValidation,
  updateConversationValidation,
  listConversationsValidation,
  searchConversationsValidation,
} from '../controllers/conversation.controller'
import {
  handleListMessages,
  handleSendMessage,
  handleEditMessage,
  handleDeleteMessage,
  handleMarkRead,
  handleGetReadReceipts,
  handleSearchMessages,
  sendMessageValidation,
  editMessageValidation,
  listMessagesValidation,
  markReadValidation,
  searchMessagesValidation,
} from '../controllers/message.controller'

const router = Router()

// All messaging routes require authentication
router.use(requireAuth)
router.use(apiRateLimit)

// ─── Conversation routes ───────────────────────────────────────────────────────

// Search must be registered BEFORE /:id to avoid being caught as a param route
router.get('/search',     searchConversationsValidation, handleSearchConversations)

router.get('/',           listConversationsValidation,   handleListConversations)
router.post('/',          createConversationValidation,  handleCreateConversation)
router.get('/:id',                                       handleGetConversation)
router.patch('/:id',      updateConversationValidation,  handleUpdateConversation)
router.delete('/:id',                                    handleLeaveConversation)
router.post('/:id/mute',                                 handleMuteConversation)

// ─── Message routes ────────────────────────────────────────────────────────────

// /search within a conversation — before /:mid to avoid param collision
router.get('/:id/messages/search',        searchMessagesValidation, handleSearchMessages)

router.get('/:id/messages',               listMessagesValidation,   handleListMessages)
router.post('/:id/messages',              sendMessageValidation,    handleSendMessage)
router.patch('/:id/messages/:mid',        editMessageValidation,    handleEditMessage)
router.delete('/:id/messages/:mid',                                 handleDeleteMessage)
router.post('/:id/messages/read',         markReadValidation,       handleMarkRead)
router.get('/:id/messages/:mid/reads',                             handleGetReadReceipts)

export { router as messagingRouter }