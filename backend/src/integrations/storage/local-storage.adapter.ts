import { Injectable } from "@nestjs/common";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import { join, dirname, basename } from "path";
import { StorageAdapter, UploadInput } from "./storage-adapter.interface";

@Injectable()
export class LocalStorageAdapter implements StorageAdapter {
  private readonly root = process.env.STORAGE_LOCAL_DIR || join(process.cwd(), "uploads");

  private safePath(key: string) {
    const normalized = key.replace(/\\/g, "/").replace(/^\/+/, "");
    if (normalized.includes("..")) throw new Error("Invalid storage key");
    return join(this.root, normalized);
  }

  async upload(input: UploadInput): Promise<{ key: string }> {
    const path = this.safePath(input.key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, input.body);
    return { key: input.key };
  }

  async getSignedDownloadUrl(key: string): Promise<string> {
    const path = this.safePath(key);
    const body = await readFile(path);
    const mime = this.mimeFromName(basename(path));
    return `data:${mime};base64,${body.toString("base64")}`;
  }

  async delete(key: string): Promise<void> {
    try { await unlink(this.safePath(key)); } catch { /* already removed */ }
  }

  private mimeFromName(name: string) {
    const ext = name.toLowerCase().split(".").pop();
    if (ext === "png") return "image/png";
    if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
    if (ext === "pdf") return "application/pdf";
    if (ext === "doc") return "application/msword";
    if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    return "application/octet-stream";
  }
}
