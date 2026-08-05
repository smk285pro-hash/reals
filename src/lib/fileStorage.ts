/**
 * File storage abstraction.
 *
 * Default implementation: Local disk under /home/z/my-project/reals/upload/files
 * Served via /api/files/[filename] (with auth + ownership check).
 *
 * To migrate to Vercel Blob / S3 / Cloudflare R2 later, only the 4 functions
 * below need to be re-implemented — client code stays the same.
 */

import { promises as fs } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'

// Resolve to <project_root>/upload/files
const STORAGE_DIR = path.join(process.cwd(), 'upload', 'files')

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

export interface StoredFile {
  /** Storage key — relative path used to retrieve the file later */
  filePath: string
  /** Original file name (kept for download display) */
  fileName: string
  /** File size in bytes */
  fileSize: number
  /** Lowercase extension without dot, e.g. "zip" */
  fileType: string
}

/** Ensure the storage directory exists */
async function ensureStorageDir(): Promise<void> {
  await fs.mkdir(STORAGE_DIR, { recursive: true })
}

/** Extract lowercase extension without dot. Returns "" if none. */
export function getExtension(fileName: string): string {
  const idx = fileName.lastIndexOf('.')
  if (idx < 0 || idx === fileName.length - 1) return ''
  return fileName.slice(idx + 1).toLowerCase()
}

/**
 * Save a File/Blob to local storage.
 * Returns metadata used to insert into DB.
 */
export async function saveFile(file: File | Blob, originalName: string): Promise<StoredFile> {
  await ensureStorageDir()

  const ext = getExtension(originalName)
  if (!ext || !ALLOWED_EXTENSIONS.includes(ext as AllowedExtension)) {
    throw new Error(`Định dạng không hỗ trợ: .${ext}. Cho phép: ${ALLOWED_EXTENSIONS.join(', ')}`)
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File quá lớn (${(file.size / 1024 / 1024).toFixed(1)}MB). Tối đa ${MAX_FILE_SIZE / 1024 / 1024}MB.`)
  }

  // Generate unique filename — keep extension
  const uniqueId = randomUUID()
  const storedName = `${uniqueId}.${ext}`
  const fullPath = path.join(STORAGE_DIR, storedName)

  // Write file
  const arrayBuffer = await file.arrayBuffer()
  await fs.writeFile(fullPath, Buffer.from(arrayBuffer))

  return {
    filePath: `files/${storedName}`, // relative key for retrieval
    fileName: originalName,
    fileSize: file.size,
    fileType: ext,
  }
}

/**
 * Read a stored file as a Node Buffer for streaming.
 * Throws if file does not exist.
 */
export async function readFile(filePath: string): Promise<Buffer> {
  // filePath looks like "files/abc.zip"
  const safePath = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, '')
  const fullPath = path.join(STORAGE_DIR, path.basename(safePath))
  return fs.readFile(fullPath)
}

/**
 * Delete a stored file. No-op if file doesn't exist (DB is source of truth).
 */
export async function deleteFile(filePath: string): Promise<void> {
  try {
    const safePath = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, '')
    const fullPath = path.join(STORAGE_DIR, path.basename(safePath))
    await fs.unlink(fullPath)
  } catch (err: any) {
    if (err?.code !== 'ENOENT') throw err
    // File already gone — fine
  }
}

/**
 * Get absolute filesystem path for a stored file (used by streaming responses).
 */
export function getLocalFilePath(filePath: string): string {
  const safePath = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, '')
  return path.join(STORAGE_DIR, path.basename(safePath))
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
