import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3'
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const endpoint = process.env.S3_ENDPOINT || 'http://127.0.0.1:9000'
const endpointUrl = new URL(endpoint)
const port = endpointUrl.port || (endpointUrl.protocol === 'https:' ? '443' : '80')
const bucket = process.env.S3_BUCKET_NAME || 'booth-audio-recordings'
const accessKeyId = process.env.S3_ACCESS_KEY_ID || 'minioadmin'
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || 'minioadmin'
const region = process.env.S3_REGION || 'us-east-1'
const dataDir = process.env.MINIO_DATA_DIR || path.join(tmpdir(), `booth-audio-minio-${port}`)
const consolePort = process.env.MINIO_CONSOLE_PORT || '9001'
const allowedOrigins = (process.env.MINIO_BROWSER_ORIGINS || [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3100',
  'http://127.0.0.1:3100',
  'http://localhost:3101',
  'http://127.0.0.1:3101',
].join(',')).split(',').map((origin) => origin.trim()).filter(Boolean)

if (!['localhost', '127.0.0.1'].includes(endpointUrl.hostname)) {
  throw new Error(`Refusing to start development MinIO for non-local endpoint ${endpointUrl.origin}`)
}

await mkdir(dataDir, { recursive: true })

const minio = spawn('minio', [
  'server',
  dataDir,
  '--address',
  `:${port}`,
  '--console-address',
  `:${consolePort}`,
], {
  env: {
    ...process.env,
    MINIO_ROOT_USER: accessKeyId,
    MINIO_ROOT_PASSWORD: secretAccessKey,
    MINIO_API_CORS_ALLOW_ORIGIN: allowedOrigins.join(','),
  },
  stdio: 'inherit',
})

const stop = (signal) => {
  if (!minio.killed) minio.kill(signal)
}
process.once('SIGINT', () => stop('SIGINT'))
process.once('SIGTERM', () => stop('SIGTERM'))
minio.once('exit', (code, signal) => {
  if (code && code !== 0) process.exitCode = code
  if (signal) process.exitCode = 0
})

const healthUrl = new URL('/minio/health/ready', endpointUrl).toString()
const deadline = Date.now() + 30_000
while (Date.now() < deadline) {
  try {
    const response = await fetch(healthUrl)
    if (response.ok) break
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 250))
}

const health = await fetch(healthUrl).catch(() => null)
if (!health?.ok) {
  stop('SIGTERM')
  throw new Error(`MinIO did not become ready at ${healthUrl}`)
}

const client = new S3Client({
  endpoint,
  region,
  forcePathStyle: true,
  credentials: { accessKeyId, secretAccessKey },
})

try {
  await client.send(new CreateBucketCommand({ Bucket: bucket }))
} catch (error) {
  const name = error instanceof Error ? error.name : ''
  if (name !== 'BucketAlreadyOwnedByYou' && name !== 'BucketAlreadyExists') throw error
}

console.log(`[LocalStorage] ready endpoint=${endpointUrl.origin} bucket=${bucket} origins=${allowedOrigins.join(',')}`)
await new Promise(() => {})
