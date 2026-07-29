"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.artworkJunctionValidation = exports.updateMoodboardValidation = exports.createMoodboardValidation = void 0;
exports.handleCreateMoodboard = handleCreateMoodboard;
exports.handleListMoodboards = handleListMoodboards;
exports.handleUpdateMoodboard = handleUpdateMoodboard;
exports.handleDeleteMoodboard = handleDeleteMoodboard;
exports.handleAddArtwork = handleAddArtwork;
exports.handleRemoveArtwork = handleRemoveArtwork;
exports.handleGetMoodboard = handleGetMoodboard;
const express_validator_1 = require("express-validator");
const errors_1 = require("../../../common/errors");
const moodboardService = __importStar(require("../services/moodboard.service"));
function assertValid(req) {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        const fields = Object.fromEntries(errors.array().map((e) => ['path' in e ? e.path : 'field', e.msg]));
        throw new errors_1.ValidationError('Validation failed', fields);
    }
}
// ── Validation chains ─────────────────────────────────────────────────────────
exports.createMoodboardValidation = [
    (0, express_validator_1.body)('title').isString().trim().isLength({ min: 1, max: 100 }).withMessage('Title must be 1-100 characters'),
];
exports.updateMoodboardValidation = [
    (0, express_validator_1.param)('id').isUUID().withMessage('Invalid moodboard ID'),
    (0, express_validator_1.body)('title').isString().trim().isLength({ min: 1, max: 100 }).withMessage('Title must be 1-100 characters'),
];
exports.artworkJunctionValidation = [
    (0, express_validator_1.param)('id').isUUID().withMessage('Invalid moodboard ID'),
    (0, express_validator_1.body)('artwork_id').isUUID().withMessage('Invalid artwork ID'),
];
// ── Handlers ──────────────────────────────────────────────────────────────────
async function handleCreateMoodboard(req, res, next) {
    try {
        assertValid(req);
        if (!req.auth)
            throw new errors_1.UnauthorizedError();
        const { title } = req.body;
        // Type assertion to guarantee sub is a string
        const userId = req.auth.sub;
        const moodboard = await moodboardService.createMoodboard(userId, title);
        res.status(201).json({ success: true, data: moodboard });
    }
    catch (err) {
        next(err);
    }
}
async function handleListMoodboards(req, res, next) {
    try {
        if (!req.auth)
            throw new errors_1.UnauthorizedError();
        const userId = req.auth.sub;
        const moodboards = await moodboardService.listMoodboards(userId);
        res.json({ success: true, data: moodboards });
    }
    catch (err) {
        next(err);
    }
}
async function handleUpdateMoodboard(req, res, next) {
    try {
        assertValid(req);
        if (!req.auth)
            throw new errors_1.UnauthorizedError();
        // Explicitly cast req.params to guarantee id is a string
        const { id } = req.params;
        const { title } = req.body;
        const userId = req.auth.sub;
        const moodboard = await moodboardService.updateMoodboard(id, userId, title);
        res.json({ success: true, data: moodboard });
    }
    catch (err) {
        next(err);
    }
}
async function handleDeleteMoodboard(req, res, next) {
    try {
        if (!req.auth)
            throw new errors_1.UnauthorizedError();
        const { id } = req.params;
        const userId = req.auth.sub;
        await moodboardService.deleteMoodboard(id, userId);
        res.status(204).send();
    }
    catch (err) {
        next(err);
    }
}
async function handleAddArtwork(req, res, next) {
    try {
        assertValid(req);
        if (!req.auth)
            throw new errors_1.UnauthorizedError();
        const { id } = req.params;
        const { artwork_id } = req.body;
        const userId = req.auth.sub;
        await moodboardService.addArtworkToMoodboard(id, userId, artwork_id);
        res.status(201).json({ success: true, message: 'Artwork added to moodboard' });
    }
    catch (err) {
        next(err);
    }
}
async function handleRemoveArtwork(req, res, next) {
    try {
        if (!req.auth)
            throw new errors_1.UnauthorizedError();
        const { id, artworkId } = req.params;
        const userId = req.auth.sub;
        await moodboardService.removeArtworkFromMoodboard(id, userId, artworkId);
        res.status(204).send();
    }
    catch (err) {
        next(err);
    }
}
async function handleGetMoodboard(req, res, next) {
    try {
        const { id } = req.params;
        const moodboard = await moodboardService.getMoodboard(id);
        res.json({ success: true, data: moodboard });
    }
    catch (err) {
        next(err);
    }
}
//# sourceMappingURL=moodboard.controller.js.map