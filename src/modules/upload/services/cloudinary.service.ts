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
  public_id: string;
  resource_type: string;
  bytes: number;
  width?: number;
  height?: number;
}

export interface CloudinaryUploadResult {
  secure_url: string;
  public_id: string;
  resource_type: string;
  bytes: number;
  width?: number;
  height?: number;
}

export const CloudinaryService = {
  uploadStream(fileBuffer: Buffer, isVideo: boolean): Promise<CloudinaryUploadResult> {
    return new Promise((resolve, reject) => {
      // 2. Explicitly typed the options object here
      const uploadOpts: UploadApiOptions = {
        folder: 'artsony_media',
        resource_type: isVideo ? 'video' : 'image',
      };

      const stream = cloudinary.uploader.upload_stream(uploadOpts, (error, result) => {
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