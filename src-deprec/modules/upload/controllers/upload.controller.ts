import type { Request, Response, NextFunction } from 'express';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs/promises';
import { ValidationError } from '../../../common/errors';
import { CloudinaryService } from '../services/cloudinary.service';

export async function handleArtworkUpload(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.file) {
      throw new ValidationError('No file uploaded or file field name is incorrect');
    }

    const isImage = req.file.mimetype.startsWith('image/');
    const isVideo = req.file.mimetype.startsWith('video/');

    if (!isImage && !isVideo) {
      throw new ValidationError('Unsupported file type. Only images and videos are allowed.');
    }

    // 1. Local Dev Fallback (Only for images, passing videos to Cloudinary even in Dev if preferred)
    if (process.env['NODE_ENV'] === 'development' && isImage) {
      let width: number | null = null;
      let height: number | null = null;

      try {
        const metadata = await sharp(req.file.buffer).metadata();
        width = metadata.width ?? null;
        height = metadata.height ?? null;
      } catch (imageErr) {
        console.error('[UploadController] Failed to parse image metadata:', imageErr);
      }

      const uploadDir = path.join(process.cwd(), 'public', 'uploads');
      await fs.mkdir(uploadDir, { recursive: true });

      const fileHash = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const originalExt = path.extname(req.file.originalname) || '.jpg';

      const originalFilename = `${fileHash}-original${originalExt}`;
      const optimizedFilename = `${fileHash}-optimized.jpeg`;
      const thumbnailFilename = `${fileHash}-thumb.jpeg`;

      await fs.writeFile(path.join(uploadDir, originalFilename), req.file.buffer);

      await sharp(req.file.buffer)
        .jpeg({ quality: 80, progressive: true })
        .toFile(path.join(uploadDir, optimizedFilename));

      await sharp(req.file.buffer)
        .resize(400, 400, { fit: 'cover', position: 'center' })
        .jpeg({ quality: 75 })
        .toFile(path.join(uploadDir, thumbnailFilename));

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
    const cloudAsset = await CloudinaryService.uploadStream(req.file.buffer, isVideo);

    res.status(201).json({
      original_url: cloudAsset.secure_url,
      optimized_url: cloudAsset.resource_type === 'image' ? cloudAsset.secure_url : null,
      thumbnail_url: cloudAsset.resource_type === 'image' ? cloudAsset.secure_url : null,
      mime_type: req.file.mimetype,
      file_size_bytes: cloudAsset.bytes,
      width: cloudAsset.width || null,
      height: cloudAsset.height || null,
    });
  } catch (err) {
    console.error('EXACT UPLOAD ERROR:', err);
    next(err);
  }
}