import type { Request, Response, NextFunction } from 'express'
import sharp from 'sharp'
import path from 'path'
import fs from 'fs/promises'
// import { ValidationError } from '@/common/errors'
import { ValidationError } from '../../../common/errors'

export async function handleArtworkUpload(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.file) {
      throw new ValidationError('No file uploaded or file field name is incorrect')
    }

    // 1. Analyze image dimensions using sharp
    let width: number | null = null
    let height: number | null = null
    
    if (req.file.mimetype.startsWith('image/')) {
      try {
        const metadata = await sharp(req.file.buffer).metadata()
        width = metadata.width ?? null
        height = metadata.height ?? null
      } catch (imageErr) {
        console.error('[UploadController] Failed to parse image metadata:', imageErr)
      }
    }

    // ── DEVELOPMENT LOCAL FALLBACK ───────────────────────────────────────────
    // Saves files to public/uploads locally so your application is testable.
    // Replace this block with your S3 / Cloudinary SDK code in production.
    if (process.env['NODE_ENV'] === 'development') {
      const uploadDir = path.join(process.cwd(), 'public', 'uploads')
      await fs.mkdir(uploadDir, { recursive: true })

      const fileHash = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
      const originalExt = path.extname(req.file.originalname) || '.jpg'

      const originalFilename = `${fileHash}-original${originalExt}`
      const optimizedFilename = `${fileHash}-optimized.jpeg`
      const thumbnailFilename = `${fileHash}-thumb.jpeg`

      // Save raw uploaded file
      await fs.writeFile(path.join(uploadDir, originalFilename), req.file.buffer)

      // Generate optimized & thumbnail assets locally via sharp
      if (req.file.mimetype.startsWith('image/')) {
        await sharp(req.file.buffer)
          .jpeg({ quality: 80, progressive: true })
          .toFile(path.join(uploadDir, optimizedFilename))

        await sharp(req.file.buffer)
          .resize(400, 400, { fit: 'cover', position: 'center' })
          .jpeg({ quality: 75 })
          .toFile(path.join(uploadDir, thumbnailFilename))
      }

      const backendBaseUrl = `${req.protocol}://${req.get('host')}/uploads`

      res.status(201).json({
        original_url: `${backendBaseUrl}/${originalFilename}`,
        optimized_url: req.file.mimetype.startsWith('image/') ? `${backendBaseUrl}/${optimizedFilename}` : null,
        thumbnail_url: req.file.mimetype.startsWith('image/') ? `${backendBaseUrl}/${thumbnailFilename}` : null,
        mime_type: req.file.mimetype,
        file_size_bytes: req.file.size,
        width,
        height,
      })
      return
    }
    // ── END DEVELOPMENT FALLBACK ─────────────────────────────────────────────

    /*
      TODO: Production Storage Engine Pipeline
      const cloudAsset = await storageService.uploadArtworkPipeline(req.file.buffer);
      res.status(201).json({ ...cloudAsset });
    */
    
    throw new Error('Production storage engine is not configured yet.')
  } catch (err) {
    console.error('EXACT UPLOAD ERROR:', err);
    next(err)
  }
}