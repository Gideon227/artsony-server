export type MediaKind = 'IMAGE' | 'VIDEO' | 'THREE_D' | 'PDF'
export type CloudinaryResourceType = 'image' | 'video' | 'raw'

const MB = 1024 * 1024

export interface MediaRule {
  resourceType: CloudinaryResourceType
  maxBytes: number
  formats: readonly string[]
  maxDurationSecs?: number
  minShortSidePx?: number
}

export const MEDIA_RULES: Record<MediaKind, MediaRule> = {
  IMAGE: {
    resourceType: 'image',
    maxBytes: 50 * MB,
    formats: ['jpg', 'jpeg', 'png', 'tif', 'tiff'],
  },
  VIDEO: {
    resourceType: 'video',
    maxBytes: 500 * MB,
    formats: ['mp4', 'mov', 'avi', 'mkv'],
    maxDurationSecs: 10 * 60,
    minShortSidePx: 720,
  },
  THREE_D: {
    resourceType: 'raw',
    maxBytes: 500 * MB,
    formats: ['gltf', 'glb', 'obj', 'fbx'],
  },
  // Cloudinary stores PDFs under the image resource type, which is what lets
  // it rasterise a page for the thumbnail.
  PDF: {
    resourceType: 'image',
    maxBytes: 50 * MB,
    formats: ['pdf'],
  },
}

export const MEDIA_KINDS = Object.keys(MEDIA_RULES) as MediaKind[]

export const UPLOAD_ROOT_FOLDER = 'artsony_media'
export const UPLOAD_CHUNK_BYTES = 20 * MB

export const MIME_BY_FORMAT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  gltf: 'model/gltf+json',
  glb: 'model/gltf-binary',
  obj: 'model/obj',
  fbx: 'application/octet-stream',
  pdf: 'application/pdf',
}

export function formatLabel(bytes: number): string {
  return `${Math.round(bytes / MB)}MB`
}
