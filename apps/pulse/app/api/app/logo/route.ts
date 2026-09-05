import { NextRequest, NextResponse } from 'next/server'
import { getS3Client, getStorageConfig } from '@/lib/objectStorage'
import { GetObjectCommand } from '@aws-sdk/client-s3'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/app/logo?key=xxx
 * Proxies logo images from S3/R2. Use when logoUrl is an object key.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const key = searchParams.get('key')
  if (!key) {
    return NextResponse.json({ error: 'key required' }, { status: 400 })
  }

  const config = getStorageConfig()
  if (!config) {
    return NextResponse.json({ error: 'Storage not configured' }, { status: 500 })
  }

  try {
    const client = getS3Client()
    const command = new GetObjectCommand({ Bucket: config.bucket, Key: key })
    const response = await client.send(command)

    if (!response.Body) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const contentType = response.ContentType || 'image/png'
    const body = await response.Body.transformToByteArray()

    return new NextResponse(body as unknown as BodyInit, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch (error: unknown) {
    const is404 = (error as { name?: string })?.name === 'NoSuchKey'
    if (is404) {
      console.warn('[Logo] 404 Not found:', { bucket: config.bucket, key })
    }
    const status = is404 ? 404 : 500
    return NextResponse.json({ error: 'Failed to load logo' }, { status })
  }
}
