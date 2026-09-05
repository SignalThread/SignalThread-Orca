import { afterEach, describe, expect, it } from 'vitest'
import { presignPut } from './objectStorage'

const original = { ...process.env }

afterEach(() => {
  process.env = { ...original }
})

describe('browser-facing object storage presigning', () => {
  it('signs direct uploads for the explicit browser endpoint', async () => {
    process.env.S3_ENDPOINT = 'http://minio:9000'
    process.env.S3_PUBLIC_ENDPOINT = 'http://127.0.0.1:9000'
    process.env.S3_BUCKET_NAME = 'uploads'
    process.env.S3_ACCESS_KEY_ID = 'minioadmin'
    process.env.S3_SECRET_ACCESS_KEY = 'minioadmin'
    process.env.S3_REGION = 'us-east-1'
    process.env.S3_FORCE_PATH_STYLE = 'true'

    const signed = await presignPut({
      bucket: 'uploads',
      key: 'recordings/browser.webm',
      contentType: 'audio/webm',
      expiresIn: 300,
    })

    const url = new URL(signed)
    expect(url.origin).toBe('http://127.0.0.1:9000')
    expect(url.pathname).toBe('/uploads/recordings/browser.webm')
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('host')
  })

  it('keeps localhost path-style when a production env file says false', async () => {
    process.env.S3_ENDPOINT = 'http://localhost:9000'
    process.env.S3_PUBLIC_ENDPOINT = 'http://localhost:9000'
    process.env.S3_BUCKET_NAME = 'booth-audio-recordings'
    process.env.S3_ACCESS_KEY_ID = 'minioadmin'
    process.env.S3_SECRET_ACCESS_KEY = 'minioadmin'
    process.env.S3_REGION = 'us-east-1'
    process.env.S3_FORCE_PATH_STYLE = 'false'

    const url = new URL(await presignPut({
      bucket: 'booth-audio-recordings',
      key: 'recordings/browser.webm',
      contentType: 'audio/webm',
      expiresIn: 300,
    }))

    expect(url.host).toBe('localhost:9000')
    expect(url.pathname).toBe('/booth-audio-recordings/recordings/browser.webm')
  })
})
