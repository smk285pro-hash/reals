/**
 * Image storage — Cloudflare R2, PUBLIC bucket.
 *
 * Deliberately separate from `fileStorage.ts`, which serves paid product files
 * out of a PRIVATE bucket via short-lived presigned URLs. Images need the
 * opposite: `Product.thumbnail` persists a URL in the database and that URL is
 * rendered by seven different components, so it has to stay valid forever. A
 * presigned URL would expire in fifteen minutes and every product image on the
 * site would break.
 *
 * The two concerns cannot share one bucket. R2 makes public access a
 * bucket-level setting, so making thumbnails public would also make every paid
 * download public — which is the whole thing the private bucket exists to
 * prevent. Hence a second bucket, public, images only.
 */

import { randomUUID } from 'crypto'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

/** Image types accepted for product thumbnails. */
export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const

/** Max thumbnail size: 5MB. Images are display assets, not downloads. */
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024

export interface UploadedImage {
  /** Permanent public URL — safe to persist in the database */
  url: string
  /** R2 object key, kept so the object can be deleted later */
  key: string
  /** Size in bytes */
  size: number
  /** MIME type as reported by the browser */
  type: string
}

/**
 * Thrown when the uploaded file itself is wrong — bad type, too large. Carries
 * no server detail, so the route can pass the message straight to the client
 * with a 400. Configuration failures stay plain `Error` and become 500s.
 */
export class ImageValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImageValidationError'
  }
}

let client: S3Client | null = null

/**
 * Built lazily so importing this module does not require credentials — only the
 * request that actually uploads does. Names the missing variables rather than
 * letting the SDK fail opaquely several frames deeper.
 */
function getClient(): S3Client {
  if (client) return client

  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY

  const missing = [
    !accountId && 'R2_ACCOUNT_ID',
    !accessKeyId && 'R2_ACCESS_KEY_ID',
    !secretAccessKey && 'R2_SECRET_ACCESS_KEY',
  ].filter(Boolean)

  if (missing.length > 0) {
    throw new Error(`Storage chưa được cấu hình. Thiếu biến môi trường: ${missing.join(', ')}`)
  }

  client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
  })

  return client
}

/**
 * The public bucket, and the base URL it is served from.
 *
 * `R2_PUBLIC_URL` is whatever Cloudflare exposes the bucket at — either the
 * r2.dev development URL or a custom domain. It is read at call time rather
 * than module load so a missing value surfaces as a per-request error instead
 * of breaking the build.
 */
function getPublicConfig(): { bucket: string; baseUrl: string } {
  const bucket = process.env.R2_PUBLIC_BUCKET
  const baseUrl = process.env.R2_PUBLIC_URL

  const missing = [
    !bucket && 'R2_PUBLIC_BUCKET',
    !baseUrl && 'R2_PUBLIC_URL',
  ].filter(Boolean)

  if (missing.length > 0) {
    throw new Error(
      `Image storage chưa được cấu hình. Thiếu biến môi trường: ${missing.join(', ')}. ` +
        `Tạo một R2 bucket công khai cho ảnh và trỏ R2_PUBLIC_URL vào domain của bucket đó.`
    )
  }

  // A trailing slash here would produce a double slash in every stored URL, and
  // those URLs are persisted — so normalise once, at the source.
  return { bucket: bucket!, baseUrl: baseUrl!.replace(/\/+$/, '') }
}

/** Map a MIME type to the extension to store the object under. */
function extensionFor(mimeType: string): string {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    case 'image/gif':
      return 'gif'
    default:
      return 'bin'
  }
}

/**
 * Upload an image to the public bucket and return its permanent URL.
 *
 * The caller is responsible for authentication; this function only validates
 * the file itself.
 */
export async function uploadImage(file: File, userId: string): Promise<UploadedImage> {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    throw new ImageValidationError(
      `Định dạng không hỗ trợ. Chấp nhận: ${ALLOWED_IMAGE_TYPES.join(', ')}`
    )
  }

  if (file.size > MAX_IMAGE_SIZE) {
    throw new ImageValidationError(
      `File quá lớn. Tối đa ${MAX_IMAGE_SIZE / 1024 / 1024}MB. File của bạn: ${(file.size / 1024 / 1024).toFixed(1)}MB`
    )
  }

  const { bucket, baseUrl } = getPublicConfig()

  // Namespaced by user so one seller's uploads are easy to attribute and purge;
  // a UUID basename keeps the original filename out of a URL that will be
  // public and permanent.
  const key = `images/${userId}/${randomUUID()}.${extensionFor(file.type)}`

  const arrayBuffer = await file.arrayBuffer()

  await getClient().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: new Uint8Array(arrayBuffer),
      ContentType: file.type,
      // Thumbnails are immutable — a new upload gets a new key — so they can be
      // cached hard. This is what keeps repeat views off the origin entirely.
      CacheControl: 'public, max-age=31536000, immutable',
    })
  )

  return {
    url: `${baseUrl}/${key}`,
    key,
    size: file.size,
    type: file.type,
  }
}
