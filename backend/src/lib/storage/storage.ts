import type { Readable } from 'node:stream'
import { env } from '../../config/env.js'
import { LocalStorage } from './local-storage.js'
import { S3Storage } from './s3-storage.js'

export interface StoredObject {
  body: NodeJS.ReadableStream
  size: number
  contentType?: string
}

/** Blob storage for uploads and generated audio (local disk in dev, S3/R2 in production) */
export interface Storage {
  put(key: string, body: Buffer, contentType: string): Promise<void>
  /** For large files assembled piece by piece (e.g. MP3 exports); never held in memory whole */
  putStream(key: string, body: Readable, contentType: string): Promise<void>
  get(key: string): Promise<Buffer>
  exists(key: string): Promise<boolean>
  delete(key: string): Promise<void>
  deletePrefix(prefix: string): Promise<void>
  /** Size in bytes, or null if there's no such file */
  size(key: string): Promise<number | null>
  /** Time-limited URL a client can fetch without auth headers */
  signedUrl(key: string, ttlSeconds: number): Promise<string>
  /**
   * Time-limited URL a client can PUT exactly this file to (that type, that size),
   * so large uploads go straight to storage instead of through the API
   */
  signedUploadUrl(key: string, contentType: string, sizeBytes: number, ttlSeconds: number): Promise<string>
}

export const storage: Storage = env.STORAGE_DRIVER === 's3' ? new S3Storage() : new LocalStorage()
