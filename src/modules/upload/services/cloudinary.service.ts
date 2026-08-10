import { v2 as cloudinary, UploadApiOptions } from 'cloudinary';
import { config } from '../../../config'; // Assuming this loads your .env

const cloudName = process.env['CLOUDINARY_CLOUD_NAME'];
const apiKey = process.env['CLOUDINARY_API_KEY'];
const apiSecret = process.env['CLOUDINARY_API_SECRET'];

if (!cloudName || !apiKey || !apiSecret) {
  console.warn('[Cloudinary] Missing environment variables. Uploads will fail.');
}

cloudinary.config({
  cloud_name: cloudName as string,
  api_key: apiKey as string,
  api_secret: apiSecret as string,
});

export interface CloudinaryUploadResult {
  secure_url: string;
  optimized_url: string;
  thumbnail_url: string;
  public_id: string;
  resource_type: string;
  bytes: number;
  width?: number;
  height?: number;
}

// Thumbnail is a content-aware square crop, matching the dimensions the
// local-dev sharp() fallback produces so both paths behave identically for
// grid/list UI. Optimized is the original dimensions with automatic
// format/quality selection (WebP/AVIF where supported, no visible quality
// loss) — genuinely lighter than the original, unlike just re-serving
// secure_url.
const THUMBNAIL_SIZE = 400;

function buildEagerTransformations(isVideo: boolean) {
  if (isVideo) {
    return [
      // [0] Optimized delivery: auto codec/quality, no resize.
      { resource_type: 'video' as const, quality: 'auto', fetch_format: 'auto' },
      // [1] Thumbnail: single JPG frame captured at t=0, cropped to a
      // square. Used anywhere a static preview is needed (grids, lists)
      // instead of embedding a video player.
      {
        resource_type: 'video' as const,
        format: 'jpg',
        width: THUMBNAIL_SIZE,
        height: THUMBNAIL_SIZE,
        crop: 'fill',
        gravity: 'auto',
        quality: 'auto',
        start_offset: '0',
      },
    ];
  }
  return [
    // [0] Optimized delivery: auto format/quality at original dimensions.
    { quality: 'auto', fetch_format: 'auto' },
    // [1] Thumbnail: content-aware square crop.
    {
      width: THUMBNAIL_SIZE,
      height: THUMBNAIL_SIZE,
      crop: 'fill',
      gravity: 'auto',
      quality: 'auto',
      fetch_format: 'auto',
    },
  ];
}

export const CloudinaryService = {
  uploadStream(fileBuffer: Buffer, isVideo: boolean): Promise<CloudinaryUploadResult> {
    return new Promise((resolve, reject) => {
      // Eager transformations are generated synchronously as part of this
      // upload call (eager_async: false) so the optimized/thumbnail URLs in
      // the response are guaranteed to resolve immediately — no dependency
      // on the account's "strict transformations" setting and no first-view
      // generation latency for the end user. This does add processing time
      // to the upload request itself; if upload volume grows large enough
      // for that to matter, switch to eager_async: true plus a
      // notification_url webhook and poll/patch the asset afterward rather
      // than blocking the request.
      const uploadOpts: UploadApiOptions = {
        folder: 'artsony_media',
        resource_type: isVideo ? 'video' : 'image',
        eager: buildEagerTransformations(isVideo),
        eager_async: false,
      };

      const stream = cloudinary.uploader.upload_stream(uploadOpts, (error, result) => {
        if (error || !result) {
          return reject(error || new Error('Cloudinary upload returned empty result'));
        }

        const eager = (result['eager'] ?? []) as Array<{ secure_url?: string }>;
        // Cloudinary preserves eager transformations in the order requested:
        // eager[0] = optimized, eager[1] = thumbnail. Fall back to the
        // original secure_url if for any reason a derived asset didn't come
        // back, so the response is never missing a usable URL.
        const optimizedUrl = eager[0]?.secure_url ?? result.secure_url;
        const thumbnailUrl = eager[1]?.secure_url ?? eager[0]?.secure_url ?? result.secure_url;

        resolve({
          secure_url: result.secure_url,
          optimized_url: optimizedUrl,
          thumbnail_url: thumbnailUrl,
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