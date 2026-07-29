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
export declare const CloudinaryService: {
    uploadStream(fileBuffer: Buffer, isVideo: boolean): Promise<CloudinaryUploadResult>;
};
//# sourceMappingURL=cloudinary.service.d.ts.map