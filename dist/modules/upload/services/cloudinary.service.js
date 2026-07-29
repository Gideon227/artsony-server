"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CloudinaryService = void 0;
const cloudinary_1 = require("cloudinary");
const cloudName = process.env['CLOUDINARY_CLOUD_NAME'];
const apiKey = process.env['CLOUDINARY_API_KEY'];
const apiSecret = process.env['CLOUDINARY_API_SECRET'];
if (!cloudName || !apiKey || !apiSecret) {
    console.warn('[Cloudinary] Missing environment variables. Uploads will fail.');
}
cloudinary_1.v2.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
});
exports.CloudinaryService = {
    uploadStream(fileBuffer, isVideo) {
        return new Promise((resolve, reject) => {
            // 2. Explicitly typed the options object here
            const uploadOpts = {
                folder: 'artsony_media',
                resource_type: isVideo ? 'video' : 'image',
            };
            const stream = cloudinary_1.v2.uploader.upload_stream(uploadOpts, (error, result) => {
                if (error || !result) {
                    return reject(error || new Error('Cloudinary upload returned empty result'));
                }
                resolve({
                    secure_url: result.secure_url,
                    public_id: result.public_id,
                    resource_type: result.resource_type,
                    bytes: result.bytes,
                    width: result.width,
                    height: result.height,
                });
            });
            stream.end(fileBuffer);
        });
    },
};
//# sourceMappingURL=cloudinary.service.js.map