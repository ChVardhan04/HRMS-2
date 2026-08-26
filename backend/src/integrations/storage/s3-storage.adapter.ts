import { Injectable, Logger } from "@nestjs/common";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { StorageAdapter, UploadInput } from "./storage-adapter.interface";

@Injectable()
export class S3StorageAdapter implements StorageAdapter {
  private readonly logger = new Logger(S3StorageAdapter.name);
  private client: S3Client | null = null;
  private bucket = process.env.STORAGE_BUCKET ?? "hrms-ats-documents";
  private bucketReady = false;

  private getClient() {
    if (this.client) return this.client;
    if (!process.env.STORAGE_ACCESS_KEY_ID) return null;
    this.client = new S3Client({
      region: process.env.STORAGE_REGION ?? "ap-south-1",
      endpoint: process.env.STORAGE_ENDPOINT || undefined,
      forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE === "true",
      credentials: {
        accessKeyId: process.env.STORAGE_ACCESS_KEY_ID,
        secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY!,
      },
    });
    return this.client;
  }

  private async ensureBucket(client: S3Client) {
    if (this.bucketReady || process.env.STORAGE_AUTO_CREATE_BUCKET !== "true")
      return;
    try {
      await client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await client.send(new CreateBucketCommand({ Bucket: this.bucket }));
      } catch (error) {
        // A managed production bucket may intentionally deny bucket creation. Only rethrow
        // when it still cannot be reached, otherwise later uploads will surface the real error.
        this.logger.warn(
          `Could not auto-create storage bucket ${this.bucket}: ${(error as Error).message}`,
        );
      }
    }
    this.bucketReady = true;
  }

  async upload(input: UploadInput): Promise<{ key: string }> {
    const client = this.getClient();
    if (!client)
      throw new Error(
        "Object storage is not configured. Set STORAGE_ACCESS_KEY_ID and STORAGE_SECRET_ACCESS_KEY.",
      );
    await this.ensureBucket(client);
    await client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
      }),
    );
    return { key: input.key };
  }

  async getSignedDownloadUrl(
    key: string,
    expiresInSeconds = 900,
  ): Promise<string> {
    const client = this.getClient();
    if (!client) throw new Error("Object storage is not configured.");
    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      {
        expiresIn: expiresInSeconds,
      },
    );
  }

  async delete(key: string): Promise<void> {
    const client = this.getClient();
    if (!client) return;
    await client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}
