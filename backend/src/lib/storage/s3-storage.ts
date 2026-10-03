import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { Readable } from 'node:stream'
import { env } from '../../config/env.js'
import type { Storage } from './storage.js'

/** S3-compatible storage (AWS S3, Cloudflare R2, MinIO) */
export class S3Storage implements Storage {
  private readonly client = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: Boolean(env.S3_ENDPOINT),
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID ?? '', secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? '' },
  })
  private readonly bucket = env.S3_BUCKET ?? ''

  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }))
  }

  /** Multipart upload, so the body streams through in small parts */
  async putStream(key: string, body: Readable, contentType: string) {
    await new Upload({ client: this.client, params: { Bucket: this.bucket, Key: key, Body: body, ContentType: contentType } }).done()
  }

  async get(key: string) {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
    return Buffer.from(await res.Body!.transformToByteArray())
  }

  exists(key: string) {
    return this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key })).then(() => true, () => false)
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
  }

  async deletePrefix(prefix: string) {
    let token: string | undefined
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }),
      )
      const keys = (page.Contents ?? []).map((o) => ({ Key: o.Key! }))
      if (keys.length) {
        await this.client.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: keys } }))
      }
      token = page.NextContinuationToken
    } while (token)
  }

  signedUrl(key: string, ttlSeconds: number) {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: ttlSeconds })
  }
}
