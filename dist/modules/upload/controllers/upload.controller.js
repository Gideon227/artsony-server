"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleArtworkUpload = handleArtworkUpload;
const sharp_1 = __importDefault(require("sharp"));
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
const errors_1 = require("../../../common/errors");
const cloudinary_service_1 = require("../services/cloudinary.service");
async function handleArtworkUpload(req, res, next) {
    try {
        if (!req.file) {
            throw new errors_1.ValidationError('No file uploaded or file field name is incorrect');
        }
        const isImage = req.file.mimetype.startsWith('image/');
        const isVideo = req.file.mimetype.startsWith('video/');
        if (!isImage && !isVideo) {
            throw new errors_1.ValidationError('Unsupported file type. Only images and videos are allowed.');
        }
        // 1. Local Dev Fallback (Only for images, passing videos to Cloudinary even in Dev if preferred)
        if (process.env['NODE_ENV'] === 'development' && isImage) {
            let width = null;
            let height = null;
            try {
                const metadata = await (0, sharp_1.default)(req.file.buffer).metadata();
                width = metadata.width ?? null;
                height = metadata.height ?? null;
            }
            catch (imageErr) {
                console.error('[UploadController] Failed to parse image metadata:', imageErr);
            }
            const uploadDir = path_1.default.join(process.cwd(), 'public', 'uploads');
            await promises_1.default.mkdir(uploadDir, { recursive: true });
            const fileHash = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
            const originalExt = path_1.default.extname(req.file.originalname) || '.jpg';
            const originalFilename = `${fileHash}-original${originalExt}`;
            const optimizedFilename = `${fileHash}-optimized.jpeg`;
            const thumbnailFilename = `${fileHash}-thumb.jpeg`;
            await promises_1.default.writeFile(path_1.default.join(uploadDir, originalFilename), req.file.buffer);
            await (0, sharp_1.default)(req.file.buffer)
                .jpeg({ quality: 80, progressive: true })
                .toFile(path_1.default.join(uploadDir, optimizedFilename));
            await (0, sharp_1.default)(req.file.buffer)
                .resize(400, 400, { fit: 'cover', position: 'center' })
                .jpeg({ quality: 75 })
                .toFile(path_1.default.join(uploadDir, thumbnailFilename));
            const backendBaseUrl = `${req.protocol}://${req.get('host')}/uploads`;
            res.status(201).json({
                original_url: `${backendBaseUrl}/${originalFilename}`,
                optimized_url: `${backendBaseUrl}/${optimizedFilename}`,
                thumbnail_url: `${backendBaseUrl}/${thumbnailFilename}`,
                mime_type: req.file.mimetype,
                file_size_bytes: req.file.size,
                width,
                height,
            });
            return;
        }
        // 2. Production Storage Engine Pipeline (Cloudinary)
        const cloudAsset = await cloudinary_service_1.CloudinaryService.uploadStream(req.file.buffer, isVideo);
        res.status(201).json({
            original_url: cloudAsset.secure_url,
            optimized_url: cloudAsset.resource_type === 'image' ? cloudAsset.secure_url : null,
            thumbnail_url: cloudAsset.resource_type === 'image' ? cloudAsset.secure_url : null,
            mime_type: req.file.mimetype,
            file_size_bytes: cloudAsset.bytes,
            width: cloudAsset.width || null,
            height: cloudAsset.height || null,
        });
    }
    catch (err) {
        console.error('EXACT UPLOAD ERROR:', err);
        next(err);
    }
}
//# sourceMappingURL=upload.controller.js.map