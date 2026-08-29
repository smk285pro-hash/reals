/**
 * File storage abstraction — Cloudflare R2 (S3-compatible).
 *
 * Product files live in a PRIVATE R2 bucket. Nothing is ever served from
 * `public/` and nothing is streamed through the Next.js function — the only way
 * out is a short-lived presigned URL minted after a download grant has been
 * checked in the route handler.
 *
 * Why R2 rather than local disk: Vercel's filesystem is ephemeral and read-only
 * outside /tmp, so anything written by a serverless invocation disappears. R2
 * also has zero egress cost, which matters when the product IS the download.
 *
 * Why presigned redirect rather than streaming: a Vercel function response is
 * capped around 4.5MB, so a 500MB plugin can never pass through it. Redirecting
 * hands the transfer to R2 and keeps function time near zero.
 *
 * The `StoredFile` shape is unchanged from the previous disk implementation, so
 * `ProductFile` rows and all client code keep working — `filePath` now holds an
 * R2 object key instead of a disk-relative path.
 */

import { randomUUID } from 'crypto'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { sanitizeFilename } from './filename'

// Allowed file extensions for product downloads
export const ALLOWED_EXTENSIONS = [
  'zip', 'rar', '7z',
  'lua', 'eel', 'jsfx',
  'py',
  'reaperconfigzip', 'reaperconfig', 'rpl',
  'txt', 'md', 'pdf',
] as const

export type AllowedExtension = typeof ALLOWED_EXTENSIONS[number]

// Max upload size: 500 MB (REAPER plugins + sample packs + templates)
export const MAX_FILE_SIZE = 500 * 1024 * 1024

/**
 * Presigned URLs are deliberately short-lived: long enough to click, not long
 * enough to pass around. A paid product's link expiring is the point.
 */
const URL_TTL_SECONDS = 15 * 60

export interface StoredFile {
  /** Storage key — R2 object key used to retrieve the file later */
  filePath: string
  /** Original file name (kept for download display) */
  fileName: string
  /** File size in bytes */
  fileSize: number
  /** Lowercase extension without dot, e.g. "zip" */
  fileType: string
}

let client: S3Client | null = null

/**
 * Built lazily so importing this module does not require R2 credentials — only
 * the request that actually touches storage does. Throws a message that names
 * the missing variables rather than letting the SDK fail with something opaque
 * three frames deeper.
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
    !process.env.R2_BUCKET && 'R2_BUCKET',
  ].filter(Boolean)

  if (missing.length > 0) {
    throw new Error(
      `Storage chưa được cấu hình. Thiếu biến môi trường: ${missing.join(', ')}`
    )
  }

  client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: accessKeyId!,
      secretAccessKey: secretAccessKey!,
    },
  })

  return client
}

/** Read at call time, not module load, so a missing value surfaces per-request. */
function getBucket(): string {
  const bucket = process.env.R2_BUCKET
  if (!bucket) {
    throw new Error('Storage chưa được cấu hình. Thiếu biến môi trường: R2_BUCKET')
  }
  return bucket
}

/** Extract lowercase extension without dot. Returns "" if none. */
export function getExtension(fileName: string): string {
  const idx = fileName.lastIndexOf('.')
  if (idx < 0 || idx === fileName.length - 1) return ''
  return fileName.slice(idx + 1).toLowerCase()
}

/**
 * Upload a File/Blob to R2.
 * Returns metadata used to insert into DB.
 */
export async function saveFile(file: File | Blob, originalName: string): Promise<StoredFile> {
  const ext = getExtension(originalName)
  if (!ext || !ALLOWED_EXTENSIONS.includes(ext as AllowedExtension)) {
    throw new Error(`Định dạng không hỗ trợ: .${ext}. Cho phép: ${ALLOWED_EXTENSIONS.join(', ')}`)
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File quá lớn (${(file.size / 1024 / 1024).toFixed(1)}MB). Tối đa ${MAX_FILE_SIZE / 1024 / 1024}MB.`)
  }

  // A UUID key keeps the original name out of the object path entirely, so two
  // sellers uploading "master.zip" never collide and the key reveals nothing.
  const key = `files/${randomUUID()}.${ext}`

  const arrayBuffer = await file.arrayBuffer()

  await getClient().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: new Uint8Array(arrayBuffer),
      ContentType: (file as File).type || 'application/octet-stream',
      // The friendly name travels with the object so a presigned URL minted
      // later can fall back to it even without the DB row.
      Metadata: { originalname: encodeURIComponent(originalName) },
    })
  )

  return {
    filePath: key,
    fileName: originalName,
    fileSize: file.size,
    fileType: ext,
  }
}

/**
 * Mint a short-lived presigned download URL.
 *
 * The caller MUST have already verified the download grant (free product, or a
 * Purchase row, or seller/admin ownership) — this function performs no
 * authorization of its own.
 */
export async function createDownloadUrl(options: {
  key: string
  filename: string
}): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: getBucket(),
    Key: options.key,
    // Force a download with the friendly filename rather than the object key.
    ResponseContentDisposition: `attachment; filename="${sanitizeFilename(options.filename)}"`,
  })

  return getSignedUrl(getClient(), command, { expiresIn: URL_TTL_SECONDS })
}

/**
 * Delete a stored file. No-op if the object doesn't exist — the DB row is the
 * source of truth, and R2 DeleteObject is already idempotent.
 */
export async function deleteFile(filePath: string): Promise<void> {
  await getClient().send(
    new DeleteObjectCommand({
      Bucket: getBucket(),
      Key: filePath,
    })
  )
}

/**
 * Format bytes to human-readable string.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
