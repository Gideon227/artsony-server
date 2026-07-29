"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletRouter = void 0;
const express_1 = require("express");
const auth_middleware_1 = require("../../../middleware/auth.middleware");
const rate_limit_middleware_1 = require("../../../middleware/rate-limit.middleware");
const wallet_controller_1 = require("../controllers/wallet.controller");
const router = (0, express_1.Router)();
exports.walletRouter = router;
router.use(auth_middleware_1.requireAuth);
router.use(rate_limit_middleware_1.apiRateLimit);
// ── Self-service (artist views/manages their own wallet) ───────────────────────
router.get('/balance', wallet_controller_1.handleGetBalance);
router.get('/ledger', wallet_controller_1.listLedgerValidation, wallet_controller_1.handleListLedger);
router.post('/withdrawals', wallet_controller_1.requestWithdrawalValidation, wallet_controller_1.handleRequestWithdrawal);
router.get('/withdrawals', wallet_controller_1.handleListMyWithdrawals);
router.post('/withdrawals/:id/cancel', wallet_controller_1.handleCancelMyWithdrawal);
// ── Admin ──────────────────────────────────────────────────────────────────────
router.get('/admin/withdrawals', (0, auth_middleware_1.authorize)(['ADMIN']), wallet_controller_1.handleAdminListWithdrawals);
router.patch('/admin/withdrawals/:id', (0, auth_middleware_1.authorize)(['ADMIN']), wallet_controller_1.transitionWithdrawalValidation, wallet_controller_1.handleAdminTransitionWithdrawal);
router.get('/admin/artists/:userId/balance', (0, auth_middleware_1.authorize)(['ADMIN']), wallet_controller_1.handleAdminGetArtistBalance);
//# sourceMappingURL=wallet.routes.js.map