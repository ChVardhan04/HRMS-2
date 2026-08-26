export interface UploadInput {
  key: string;
  body: Buffer;
  contentType: string;
}

/**
 * S3-compatible object storage abstraction. The concrete implementation can target AWS S3,
 * Cloudflare R2, MinIO or any other S3-compatible endpoint purely via env configuration —
 * business modules (documents, resumes, offer letters, reports) never talk to a specific
 * provider's SDK directly.
 */
export interface StorageAdapter {
  upload(input: UploadInput): Promise<{ key: string }>;
  getSignedDownloadUrl(key: string, expiresInSeconds?: number): Promise<string>;
  delete(key: string): Promise<void>;
}

export const STORAGE_ADAPTER = "STORAGE_ADAPTER";
