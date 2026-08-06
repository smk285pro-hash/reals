/**
 * Kiểm tra R2 credentials + luồng presigned URL hoạt động end-to-end.
 *
 * Chạy:  node scripts/test-r2.mjs
 *
 * Script này tự đọc .env.local, upload một file text nhỏ, mint presigned URL,
 * tải về qua URL đó, rồi xoá. Không chạm vào database.
 */
import {
  S3Client,
  ListObjectsV2Command,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import fs from 'fs'
import path from 'path'

const envPath = path.join(process.cwd(), '.env.local')
if (!fs.existsSync(envPath)) {
  console.error('Không tìm thấy .env.local ở', envPath)
  process.exit(1)
}

const txt = fs.readFileSync(envPath, 'utf8')
const read = (key) => {
  const m = txt.match(new RegExp('^' + key + '="?([^"\r\n]*)"?', 'm'))
  return m ? m[1] : null
}

const accountId = read('R2_ACCOUNT_ID')
const accessKeyId = read('R2_ACCESS_KEY_ID')
const secretAccessKey = read('R2_SECRET_ACCESS_KEY')
const bucket = read('R2_BUCKET')

const missing = [
  !accountId && 'R2_ACCOUNT_ID',
  !accessKeyId && 'R2_ACCESS_KEY_ID',
  !secretAccessKey && 'R2_SECRET_ACCESS_KEY',
  !bucket && 'R2_BUCKET',
].filter(Boolean)

if (missing.length) {
  console.error('Thiếu biến trong .env.local:', missing.join(', '))
  process.exit(1)
}

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
})

const TEST_KEY = 'files/__r2_selftest.txt'
const TEST_BODY = 'hello from reals r2 selftest'

try {
  console.log('1. Kết nối + liệt kê bucket…')
  const listed = await client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 5 }))
  console.log(`   ✓ Bucket "${bucket}" truy cập được. Object hiện có: ${listed.KeyCount ?? 0}`)

  console.log('2. Upload file test…')
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: TEST_KEY,
    Body: TEST_BODY,
    ContentType: 'text/plain',
  }))
  console.log(`   ✓ Đã upload ${TEST_KEY}`)

  console.log('3. Mint presigned URL (TTL 15 phút)…')
  const url = await getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: TEST_KEY,
      ResponseContentDisposition: 'attachment; filename="selftest.txt"',
    }),
    { expiresIn: 900 }
  )
  console.log(`   ✓ URL dài ${url.length} ký tự`)

  console.log('4. Tải về qua presigned URL…')
  const res = await fetch(url)
  const body = await res.text()
  const ok = res.status === 200 && body === TEST_BODY
  console.log(`   ${ok ? '✓' : '✗'} HTTP ${res.status} | nội dung khớp: ${body === TEST_BODY}`)
  console.log(`   Content-Disposition: ${res.headers.get('content-disposition')}`)

  console.log('5. Xoá file test…')
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: TEST_KEY }))
  console.log('   ✓ Đã xoá')

  if (ok) {
    console.log('\n>>> R2 HOẠT ĐỘNG ĐẦY ĐỦ — upload, presign, download, delete đều OK <<<')
  } else {
    console.log('\n>>> R2 kết nối được nhưng bước tải về không khớp — xem lại output trên <<<')
    process.exit(1)
  }
} catch (err) {
  console.error('\n✗ LỖI:', err.name, '-', err.message)
  if (err.$metadata) console.error('   HTTP status:', err.$metadata.httpStatusCode)
  console.error('\nGợi ý:')
  console.error(' - NoSuchBucket → R2_BUCKET sai tên, hoặc bucket chưa tạo')
  console.error(' - InvalidAccessKeyId / SignatureDoesNotMatch → sai key')
  console.error(' - Invalid URL → R2_ACCOUNT_ID rỗng hoặc sai định dạng')
  process.exit(1)
}
