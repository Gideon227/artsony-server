"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.messagingRouter = void 0;
const express_1 = require("express");
const auth_middleware_1 = require("../../../middleware/auth.middleware");
const rate_limit_middleware_1 = require("../../../middleware/rate-limit.middleware");
const conversation_controller_1 = require("../controllers/conversation.controller");
const message_controller_1 = require("../controllers/message.controller");
const router = (0, express_1.Router)();
exports.messagingRouter = router;
// All messaging routes require authentication
router.use(auth_middleware_1.requireAuth);
router.use(rate_limit_middleware_1.apiRateLimit);
// ─── Conversation routes ───────────────────────────────────────────────────────
// Search must be registered BEFORE /:id to avoid being caught as a param route
router.get('/search', conversation_controller_1.searchConversationsValidation, conversation_controller_1.handleSearchConversations);
router.get('/', conversation_controller_1.listConversationsValidation, conversation_controller_1.handleListConversations);
router.post('/', conversation_controller_1.createConversationValidation, conversation_controller_1.handleCreateConversation);
router.get('/:id', conversation_controller_1.handleGetConversation);
router.patch('/:id', conversation_controller_1.updateConversationValidation, conversation_controller_1.handleUpdateConversation);
router.delete('/:id', conversation_controller_1.handleLeaveConversation);
router.post('/:id/mute', conversation_controller_1.handleMuteConversation);
// ─── Message routes ────────────────────────────────────────────────────────────
// /search within a conversation — before /:mid to avoid param collision
router.get('/:id/messages/search', message_controller_1.searchMessagesValidation, message_controller_1.handleSearchMessages);
router.get('/:id/messages', message_controller_1.listMessagesValidation, message_controller_1.handleListMessages);
router.post('/:id/messages', message_controller_1.sendMessageValidation, message_controller_1.handleSendMessage);
router.patch('/:id/messages/:mid', message_controller_1.editMessageValidation, message_controller_1.handleEditMessage);
router.delete('/:id/messages/:mid', message_controller_1.handleDeleteMessage);
router.post('/:id/messages/read', message_controller_1.markReadValidation, message_controller_1.handleMarkRead);
router.get('/:id/messages/:mid/reads', message_controller_1.handleGetReadReceipts);
//# sourceMappingURL=messaging.router.js.map