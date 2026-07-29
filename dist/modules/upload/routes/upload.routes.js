"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadRouter = void 0;
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const auth_middleware_1 = require("../../../middleware/auth.middleware");
const rate_limit_middleware_1 = require("../../../middleware/rate-limit.middleware");
const upload_controller_1 = require("../controllers/upload.controller");
const router = (0, express_1.Router)();
exports.uploadRouter = router;
// Configure multer to store files in memory as a buffer rather than writing directly to disk
const storage = multer_1.default.memoryStorage();
const upload = (0, multer_1.default)({
    storage,
    limits: {
        fileSize: 30 * 1024 * 1024, // Max size: 30MB
    },
});
router.use(rate_limit_middleware_1.apiRateLimit);
// Field name 'file' must strictly match form.append('file', file) from frontend
router.post('/artwork', auth_middleware_1.requireAuth, upload.single('file'), upload_controller_1.handleArtworkUpload);
//# sourceMappingURL=upload.routes.js.map