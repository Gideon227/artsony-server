import { v2 as cloudinary } from 'cloudinary'
import { randomUUID } from 'crypto'
import { config } from '../../../config'
import { AppError } from '../../../common/errors'
import {
  MEDIA_RULES,
  UPLOAD_CHUNK_BYTES,
  UPLOAD_ROOT_FOLDER,
  type CloudinaryResourceType,
  type MediaKind,
} from '../upload.constants'

// config.cloudinary.* is populated via require_env() — the process will
// already have failed to start if these are missing, so no runtime
// guard/warning is needed here (see config/index.ts). Other modules
// (invoice.service.ts) rely on this configuring the shared v2 instance at
// import time.
cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
  secure: true,
  analytics: false,
})

type Transformation = Record<string, string | number>

// Every derived rendition is defined once and used for both the signed
// `eager` upload parameter and the delivery URL, so the URL Cloudinary is
// asked to pre-generate and the URL we store are the same string.
//
// Images: the original is stored untouched at full quality. `optimized` is a
// web master capped at 2560px (largest size the site ever renders) with the
// best automatic quality; `thumbnail` is a content-aware square at 800px,
// enough for retina grid cards.
//
// Videos: `optimized` is an H.264/AAC MP4 capped at 1080p — plays in every
// browser regardless of the source container or codec (iPhone HEVC .mov,
// .mkv, .avi). `thumbnail` is a poster frame at t=0.
//
// PDFs: there is no `optimized` rendition (visitors open the original);
// `thumbnail` is page one rasterised to a JPEG.
const IMAGE_OPTIMIZED: Transformation = {
  crop: 'limit',
  width: 2560,
  quality: 'auto:best',
  fetch_format: 'auto',
}
const IMAGE_THUMBNAIL: Transformation = {
  crop: 'fill',
  gravity: 'auto',
  width: 800,
  height: 800,
  quality: 'auto:good',
  fetch_format: 'auto',
}
const VIDEO_OPTIMIZED: Transformation = {
  crop: 'limit',
  width: 1920,
  video_codec: 'h264',
  audio_codec: 'aac',
  quality: 'auto:good',
}
const VIDEO_THUMBNAIL: Transformation = {
  crop: 'fill',
  gravity: 'auto',
  width: 800,
  height: 800,
  start_offset: '0',
  quality: 'auto:good',
}

const PDF_THUMBNAIL: Transformation = {
  page: 1,
  crop: 'limit',
  width: 1200,
  quality: 'auto:good',
}

interface Rendition {
  transformation: Transformation
  format?: string
}

function renditionsFor(kind: MediaKind): { optimized: Rendition | null; thumbnail: Rendition } | null {
  if (kind === 'IMAGE') {
    return {
      optimized: { transformation: IMAGE_OPTIMIZED },
      thumbnail: { transformation: IMAGE_THUMBNAIL },
    }
  }
  if (kind === 'VIDEO') {
    return {
      optimized: { transformation: VIDEO_OPTIMIZED, format: 'mp4' },
      thumbnail: { transformation: VIDEO_THUMBNAIL, format: 'jpg' },
    }
  }
  if (kind === 'PDF') {
    return {
      optimized: null,
      thumbnail: { transformation: PDF_THUMBNAIL, format: 'jpg' },
    }
  }
  return null
}

// Cloudinary's `eager` parameter is `<transformation>[/<format>]`, with
// multiple renditions separated by `|`.
function eagerParam(kind: MediaKind): string | undefined {
  const renditions = renditionsFor(kind)
  if (!renditions) return undefined
  return [renditions.optimized, renditions.thumbnail]
    .filter((rendition): rendition is Rendition => rendition !== null)
    .map(({ transformation, format }) => {
      const segment = cloudinary.utils.generate_transformation_string({ ...transformation })
      return format ? `${segment}/${format}` : segment
    })
    .join('|')
}

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '')
}

export interface UploadSignature {
  upload_url: string
  fields: Record<string, string>
  public_id: string
  resource_type: CloudinaryResourceType
  max_bytes: number
  chunk_bytes: number
}

function createUploadSignature(userId: string, kind: MediaKind, filename: string): UploadSignature {
  const rule = MEDIA_RULES[kind]
  const ext = extensionOf(filename)
  // Raw assets keep their extension in the public id (Cloudinary behaviour);
  // image/video public ids never carry one.
  const publicId =
    `${UPLOAD_ROOT_FOLDER}/${userId}/${randomUUID()}` + (rule.resourceType === 'raw' ? `.${ext}` : '')

  const params: Record<string, string | number> = {
    public_id: publicId,
    timestamp: Math.round(Date.now() / 1000),
  }
  if (rule.resourceType !== 'raw') params['allowed_formats'] = rule.formats.join(',')

  const eager = eagerParam(kind)
  if (eager) {
    params['eager'] = eager
    params['eager_async'] = kind === 'VIDEO' ? 'true' : 'false'
  }

  const signature = cloudinary.utils.api_sign_request(params, config.cloudinary.apiSecret)

  const fields: Record<string, string> = { api_key: config.cloudinary.apiKey, signature }
  for (const [key, value] of Object.entries(params)) fields[key] = String(value)

  return {
    upload_url: `https://api.cloudinary.com/v1_1/${config.cloudinary.cloudName}/${rule.resourceType}/upload`,
    fields,
    public_id: publicId,
    resource_type: rule.resourceType,
    max_bytes: rule.maxBytes,
    chunk_bytes: UPLOAD_CHUNK_BYTES,
  }
}

export interface StoredResource {
  public_id: string
  version: number
  format: string | null
  bytes: number
  width: number | null
  height: number | null
  duration: number | null
  secure_url: string
}

// The Cloudinary SDK rejects with a plain object ({ error: { message,
// http_code } } or { message, http_code }), never an Error instance.
function httpCodeOf(err: unknown): number | undefined {
  const e = err as { http_code?: number; error?: { http_code?: number } } | null
  return e?.http_code ?? e?.error?.http_code
}

function messageOf(err: unknown): string {
  const e = err as { message?: string; error?: { message?: string } } | null
  return e?.error?.message ?? e?.message ?? 'unknown error'
}

function toAppError(err: unknown, action: string): AppError {
  if (err instanceof AppError) return err
  const code = httpCodeOf(err)
  if (code === 404) return new AppError('Upload not found or not finished', 404, 'UPLOAD_NOT_FOUND')
  if (code === 420 || code === 429) {
    return new AppError('Media service is busy, please retry in a moment', 503, 'MEDIA_SERVICE_BUSY')
  }
  console.error(`[Cloudinary:${action}] ${code ?? ''} ${messageOf(err)}`)
  return new AppError('Media service error', 502, 'MEDIA_SERVICE_ERROR')
}

async function getResource(publicId: string, resourceType: CloudinaryResourceType): Promise<StoredResource> {
  try {
    const r = await cloudinary.api.resource(publicId, { resource_type: resourceType, type: 'upload' })
    return {
      public_id: r.public_id,
      version: r.version,
      format: r.format ?? null,
      bytes: r.bytes,
      width: r.width ?? null,
      height: r.height ?? null,
      duration: typeof r.duration === 'number' ? r.duration : null,
      secure_url: r.secure_url,
    }
  } catch (err) {
    throw toAppError(err, 'resource')
  }
}

async function destroyAsset(publicId: string, resourceType: CloudinaryResourceType): Promise<boolean> {
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
      type: 'upload',
      invalidate: true,
    })
    return result.result === 'ok'
  } catch (err) {
    throw toAppError(err, 'destroy')
  }
}

export interface DeliveryUrls {
  optimized_url: string | null
  thumbnail_url: string | null
}

function buildDeliveryUrls(kind: MediaKind, publicId: string, version: number): DeliveryUrls {
  const renditions = renditionsFor(kind)
  if (!renditions) return { optimized_url: null, thumbnail_url: null }

  const resourceType = MEDIA_RULES[kind].resourceType
  const urlFor = ({ transformation, format }: Rendition) =>
    cloudinary.url(publicId, {
      resource_type: resourceType,
      type: 'upload',
      version,
      secure: true,
      analytics: false,
      transformation: [transformation],
      ...(format ? { format } : {}),
    })

  return {
    optimized_url: renditions.optimized ? urlFor(renditions.optimized) : null,
    thumbnail_url: urlFor(renditions.thumbnail),
  }
}

export interface ParsedCloudinaryUrl {
  cloudName: string
  resourceType: CloudinaryResourceType
  deliveryType: string
  publicId: string
  format: string | undefined
}

const DELIVERY_URL = /^https:\/\/res\.cloudinary\.com\/([^/]+)\/(image|video|raw)\/(upload|authenticated|private)\/(.+)$/

// Stored URLs may carry transformation segments ahead of the version
// (`.../upload/f_auto,q_auto/v123/id.jpg`), so the public id is whatever
// follows the version segment.
function parseDeliveryUrl(url: string): ParsedCloudinaryUrl | null {
  const match = DELIVERY_URL.exec(url.split('?')[0] ?? '')
  if (!match) return null

  const [, cloudName, resourceType, deliveryType, rest] = match as unknown as [
    string, string, CloudinaryResourceType, string, string,
  ]
  const segments = rest.split('/').map((s) => decodeURIComponent(s))
  const versionAt = segments.findIndex((s) => /^v\d+$/.test(s))
  const idSegments = versionAt === -1 ? segments : segments.slice(versionAt + 1)
  if (idSegments.length === 0) return null

  let publicId = idSegments.join('/')
  let format: string | undefined
  if (resourceType !== 'raw') {
    const dot = publicId.lastIndexOf('.')
    if (dot > publicId.lastIndexOf('/')) {
      format = publicId.slice(dot + 1).toLowerCase()
      publicId = publicId.slice(0, dot)
    }
  }
  return { cloudName: cloudName!, resourceType, deliveryType: deliveryType!, publicId, format }
}

interface DownloadUrlInput {
  publicId: string
  resourceType: CloudinaryResourceType
  deliveryType?: string
  format?: string
  expiresInSec: number
}

// Cloudinary's download API: a signed, expiring URL that returns the stored
// original as an attachment. (The delivery-URL `s--sig--` form is a
// different mechanism and takes no expiry.)
function buildDownloadUrlFor(input: DownloadUrlInput): { url: string; expiresAt: Date } {
  const expiresAtSec = Math.floor(Date.now() / 1000) + input.expiresInSec
  const url = cloudinary.utils.private_download_url(input.publicId, input.format as string, {
    resource_type: input.resourceType,
    type: input.deliveryType ?? 'upload',
    attachment: true,
    expires_at: expiresAtSec,
  })
  return { url, expiresAt: new Date(expiresAtSec * 1000) }
}

function buildDownloadUrl(storedUrl: string, expiresInSec: number): { url: string; expiresAt: Date; format: string | undefined } {
  const parsed = parseDeliveryUrl(storedUrl)
  if (!parsed || parsed.cloudName !== config.cloudinary.cloudName) {
    throw new AppError('File is not available', 404, 'FILE_NOT_AVAILABLE')
  }
  const { url, expiresAt } = buildDownloadUrlFor({
    publicId: parsed.publicId,
    resourceType: parsed.resourceType,
    deliveryType: parsed.deliveryType,
    format: parsed.format!,
    expiresInSec,
  })
  return { url, expiresAt, format: parsed.format }
}

export const CloudinaryService = {
  createUploadSignature,
  getResource,
  destroyAsset,
  buildDeliveryUrls,
  parseDeliveryUrl,
  buildDownloadUrl,
  buildDownloadUrlFor,
}
