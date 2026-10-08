import type { NextFunction, Request, Response } from 'express'
import { body, validationResult } from 'express-validator'
import { AppError, ForbiddenError, UnauthorizedError, ValidationError } from '../../../common/errors'
import { CloudinaryService, extensionOf } from '../services/cloudinary.service'
import {
  MEDIA_KINDS,
  MEDIA_RULES,
  MIME_BY_FORMAT,
  UPLOAD_ROOT_FOLDER,
  formatLabel,
  type MediaKind,
} from '../upload.constants'

function assertValid(req: Request): void {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    const fields = Object.fromEntries(
      errors.array().map((e) => ['path' in e ? e.path : 'field', e.msg]),
    )
    throw new ValidationError('Validation failed', fields)
  }
}

function userIdOf(req: Request): string {
  const sub = req.auth?.sub
  if (!sub) throw new UnauthorizedError()
  return sub
}

// Public ids are assigned by createUploadSignature as
// `artsony_media/<userId>/<uuid>`, so the path itself proves who uploaded it.
function assertOwnsPublicId(publicId: string, userId: string): void {
  if (!publicId.startsWith(`${UPLOAD_ROOT_FOLDER}/${userId}/`) || publicId.includes('..')) {
    throw new ForbiddenError('You can only manage your own uploads')
  }
}

const kindValidator = body('kind').isIn(MEDIA_KINDS).withMessage(`kind must be one of ${MEDIA_KINDS.join(', ')}`)
const publicIdValidator = body('public_id').isString().trim().isLength({ min: 1, max: 300 })

export const validateSignUpload = [
  kindValidator,
  body('filename').isString().trim().isLength({ min: 1, max: 255 }),
  body('file_size_bytes').isInt({ min: 1 }).withMessage('file_size_bytes must be a positive integer').toInt(),
]

export const validateCompleteUpload = [kindValidator, publicIdValidator]
export const validateDeleteUpload = [kindValidator, publicIdValidator]

const KIND_LABEL: Record<MediaKind, string> = { IMAGE: 'Image', VIDEO: 'Video', THREE_D: '3D file', PDF: 'PDF' }

export async function handleSignUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    const userId = userIdOf(req)
    const { kind, filename, file_size_bytes } = req.body as {
      kind: MediaKind
      filename: string
      file_size_bytes: number
    }
    const rule = MEDIA_RULES[kind]

    const ext = extensionOf(filename)
    if (!rule.formats.includes(ext)) {
      throw new ValidationError(
        `Unsupported ${KIND_LABEL[kind].toLowerCase()} format. Allowed: ${rule.formats.join(', ').toUpperCase()}`,
        { filename: 'Unsupported file format' },
      )
    }
    if (file_size_bytes > rule.maxBytes) {
      throw new AppError(
        `${KIND_LABEL[kind]} must be ${formatLabel(rule.maxBytes)} or smaller`,
        413,
        'FILE_TOO_LARGE',
      )
    }

    res.json({ success: true, data: CloudinaryService.createUploadSignature(userId, kind, filename) })
  } catch (err) { next(err) }
}

export async function handleCompleteUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    const userId = userIdOf(req)
    const { kind, public_id } = req.body as { kind: MediaKind; public_id: string }
    assertOwnsPublicId(public_id, userId)

    const rule = MEDIA_RULES[kind]
    const resource = await CloudinaryService.getResource(public_id, rule.resourceType)

    // Everything below is checked against Cloudinary's own record of the
    // stored file, never against values the client reports.
    const reject = async (error: AppError): Promise<never> => {
      await CloudinaryService.destroyAsset(public_id, rule.resourceType)
      throw error
    }

    if (resource.bytes > rule.maxBytes) {
      return await reject(
        new AppError(`${KIND_LABEL[kind]} must be ${formatLabel(rule.maxBytes)} or smaller`, 413, 'FILE_TOO_LARGE'),
      )
    }

    const format = rule.resourceType === 'raw' ? extensionOf(public_id) : (resource.format ?? '').toLowerCase()
    if (!rule.formats.includes(format)) {
      return await reject(new ValidationError(`Unsupported ${KIND_LABEL[kind].toLowerCase()} format`))
    }

    if (kind === 'VIDEO') {
      const shortSide =
        resource.width !== null && resource.height !== null ? Math.min(resource.width, resource.height) : null
      if (resource.duration !== null && rule.maxDurationSecs && resource.duration > rule.maxDurationSecs) {
        return await reject(
          new ValidationError(`Video must be no longer than ${rule.maxDurationSecs / 60} minutes`),
        )
      }
      if (shortSide !== null && rule.minShortSidePx && shortSide < rule.minShortSidePx) {
        return await reject(new ValidationError(`Video resolution must be at least ${rule.minShortSidePx}p`))
      }
    }

    const { optimized_url, thumbnail_url } = CloudinaryService.buildDeliveryUrls(kind, public_id, resource.version)

    res.status(201).json({
      success: true,
      data: {
        public_id,
        media_type: kind,
        original_url: resource.secure_url,
        optimized_url,
        thumbnail_url,
        mime_type: MIME_BY_FORMAT[format] ?? 'application/octet-stream',
        file_size_bytes: resource.bytes,
        width: resource.width,
        height: resource.height,
        duration_secs: resource.duration !== null ? Math.round(resource.duration) : null,
      },
    })
  } catch (err) { next(err) }
}

export async function handleDeleteUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertValid(req)
    const userId = userIdOf(req)
    const { kind, public_id } = req.body as { kind: MediaKind; public_id: string }
    assertOwnsPublicId(public_id, userId)

    const deleted = await CloudinaryService.destroyAsset(public_id, MEDIA_RULES[kind].resourceType)
    res.json({ success: true, data: { deleted } })
  } catch (err) { next(err) }
}
