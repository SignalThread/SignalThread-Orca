/**
 * Object Storage Module (S3-compatible)
 * 
 * Supports:
 * - Cloudflare R2 (production)
 * - MinIO (development)
 * - Any S3-compatible storage
 * 
 * Configuration via environment variables only.
 */

import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// Environment variable validation
function validateEnv(): {
  endpoint: string
  publicEndpoint: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  region: string
  forcePathStyle: boolean
} {
  const endpoint = process.env.S3_ENDPOINT
  const publicEndpoint = process.env.S3_PUBLIC_ENDPOINT?.trim() || endpoint
  const bucket = process.env.S3_BUCKET_NAME
  const accessKeyId = process.env.S3_ACCESS_KEY_ID
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY

  const missing: string[] = []
  if (!endpoint || endpoint.trim() === '') missing.push('S3_ENDPOINT')
  if (!bucket || bucket.trim() === '') missing.push('S3_BUCKET_NAME')
  if (!accessKeyId || accessKeyId.trim() === '') missing.push('S3_ACCESS_KEY_ID')
  if (!secretAccessKey || secretAccessKey.trim() === '') missing.push('S3_SECRET_ACCESS_KEY')

  if (missing.length > 0) {
    throw new Error(
      `Missing required S3 configuration. Please set: ${missing.join(', ')}`
    )
  }

  // Region defaults
  const region = process.env.S3_REGION || (
    endpoint!.includes('r2.cloudflarestorage.com') ? 'auto' : 'us-east-1'
  )

  // Force path style defaults
  const forcePathStyleEnv = process.env.S3_FORCE_PATH_STYLE?.toLowerCase()
  const isLocalEndpoint = endpoint!.includes('localhost') || endpoint!.includes('127.0.0.1')
  // Local MinIO must use /bucket/key addressing. A stale production value
  // from another env file must not turn localhost into bucket.localhost.
  const forcePathStyle = isLocalEndpoint || forcePathStyleEnv === 'true'

  return {
    endpoint: endpoint!,
    publicEndpoint: publicEndpoint!,
    bucket: bucket!,
    accessKeyId: accessKeyId!,
    secretAccessKey: secretAccessKey!,
    region,
    forcePathStyle,
  }
}

/**
 * Get configured S3 client
 * Validates environment and creates client with proper credentials
 */
export function getS3Client(endpointOverride?: string): S3Client {
  const config = validateEnv()

  // CRITICAL: Build credentials as plain object (not async provider)
  const credentials = {
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  }

  const client = new S3Client({
    region: config.region,
    endpoint: endpointOverride ?? config.endpoint,
    credentials,
    forcePathStyle: config.forcePathStyle,
  })

  return client
}

export interface PresignPutOptions {
  bucket: string
  key: string
  contentType: string
  expiresIn: number
}

export interface UploadObjectOptions {
  bucket: string
  key: string
  body: Buffer | Uint8Array | string
  contentType: string
  cacheControl?: string
}

/**
 * Generate presigned PUT URL for direct browser upload
 */
export async function presignPut({
  bucket,
  key,
  contentType,
  expiresIn,
}: PresignPutOptions): Promise<string> {
  const config = validateEnv()
  // The application server may reach storage through a container/internal
  // hostname that a browser cannot resolve. Presigning must use the exact
  // browser-facing origin because the host participates in the signature.
  const client = getS3Client(config.publicEndpoint)

  // Log before presigning (for debugging)
  console.log('[ObjectStorage] Presigning PUT:', {
    bucket,
    key,
    endpoint: config.publicEndpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    contentType,
    expiresIn,
  })

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  })

  const url = await getSignedUrl(client, command, { expiresIn })
  
  console.log('[ObjectStorage] Presigned URL generated successfully')
  
  return url
}

/**
 * Upload an object to S3-compatible storage.
 */
export async function uploadObject({
  bucket,
  key,
  body,
  contentType,
  cacheControl,
}: UploadObjectOptions): Promise<void> {
  const client = getS3Client()
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    CacheControl: cacheControl,
  })

  await client.send(command)
  console.log('[ObjectStorage] Uploaded object:', { bucket, key, contentType })
}

/**
 * Read a UTF-8 text object from S3-compatible storage.
 *
 * Callers that treat storage as an optional cache should catch missing-object
 * and configuration errors at their boundary. Keeping the raw read here makes
 * the cache implementation share the same configured client as uploads.
 */
export async function downloadObjectText(bucket: string, key: string): Promise<string> {
  const client = getS3Client()
  const response = await client.send(new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  }))
  if (!response.Body) {
    throw new Error(`Object body is empty: ${key}`)
  }
  return response.Body.transformToString('utf-8')
}

/**
 * Verify object exists in storage using HEAD request
 * Returns true if object exists, false otherwise
 */
export async function verifyObjectExists(bucket: string, key: string): Promise<boolean> {
  try {
    const client = getS3Client()
    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
    })

    await client.send(command)
    
    console.log('[ObjectStorage] Object verified:', { bucket, key })
    return true
  } catch (error: any) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      console.warn('[ObjectStorage] Object not found:', { bucket, key })
      return false
    }
    
    // Re-throw other errors (permission issues, etc.)
    console.error('[ObjectStorage] HeadObject error:', error)
    throw error
  }
}

/**
 * Build an informational object URL from configured storage metadata.
 * This is not guaranteed to be a public/playable URL for private buckets.
 */
export function buildObjectUrl(bucket: string, key: string): string | null {
  try {
    const config = validateEnv()
    const endpoint = config.publicEndpoint.replace(/\/+$/, '')
    const encodedKey = key
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/')
    return `${endpoint}/${bucket}/${encodedKey}`
  } catch {
    return null
  }
}

/**
 * Build a browser-playable URL for an object.
 * Private buckets return a presigned GET URL using the browser-facing origin.
 */
export async function getPlayableObjectUrl(
  bucket: string,
  key: string,
  expiresIn = 60 * 60,
): Promise<string> {
  const config = validateEnv()

  const client = getS3Client(config.publicEndpoint)
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  })

  return getSignedUrl(client, command, { expiresIn })
}

/**
 * Generate unique object key for audio files
 */
export function generateObjectKey(answerId: string, fileName: string): string {
  const timestamp = Date.now()
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_')
  return `recordings/${timestamp}-${answerId}-${sanitizedFileName}`
}

/**
 * Get storage configuration (for logging/debugging)
 */
export function getStorageConfig() {
  try {
    const config = validateEnv()
    return {
      provider: config.endpoint.includes('r2.cloudflarestorage.com') 
        ? 'Cloudflare R2' 
        : config.endpoint.includes('localhost') || config.endpoint.includes('127.0.0.1')
        ? 'MinIO (local)'
        : 'S3-compatible',
      endpoint: config.endpoint,
      publicEndpoint: config.publicEndpoint,
      bucket: config.bucket,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
    }
  } catch (error) {
    return null
  }
}
