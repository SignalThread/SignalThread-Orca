/**
 * Legacy S3 module - maintained for backward compatibility
 * 
 * This file re-exports functions from the new objectStorage module
 * and provides additional utility functions.
 * 
 * New code should import from @/lib/objectStorage instead.
 */

import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getS3Client, generateObjectKey as generateKey, presignPut } from './objectStorage'

// Re-export for backward compatibility
export { generateObjectKey } from './objectStorage'

export interface PresignedUploadUrlParams {
  objectKey: string
  mimeType: string
  fileSizeBytes: number
}

/**
 * Generate a presigned URL for direct upload to S3
 * @deprecated Use presignPut from @/lib/objectStorage instead
 */
export async function generatePresignedUploadUrl({
  objectKey,
  mimeType,
  fileSizeBytes,
}: PresignedUploadUrlParams): Promise<string> {
  const bucket = process.env.S3_BUCKET_NAME!
  const expiresIn = parseInt(process.env.S3_UPLOAD_EXPIRES_IN || '300', 10)

  return presignPut({
    bucket,
    key: objectKey,
    contentType: mimeType,
    expiresIn,
  })
}

/**
 * Generate a presigned URL for downloading/streaming audio files
 */
export async function generatePresignedDownloadUrl(objectKey: string, expiresIn: number = 3600): Promise<string> {
  const client = getS3Client()
  const bucket = process.env.S3_BUCKET_NAME!

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: objectKey,
  })

  const presignedUrl = await getSignedUrl(client, command, { expiresIn })
  return presignedUrl
}

/**
 * Download an object from S3/MinIO as a Buffer
 * Used by transcription service
 */
export async function downloadObject(objectKey: string): Promise<Buffer> {
  const client = getS3Client()
  const bucket = process.env.S3_BUCKET_NAME!

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: objectKey,
  })

  const response = await client.send(command)
  
  if (!response.Body) {
    throw new Error('No body in S3 response')
  }

  // Convert stream to buffer
  const chunks: Uint8Array[] = []
  for await (const chunk of response.Body as any) {
    chunks.push(chunk)
  }
  
  return Buffer.concat(chunks)
}
