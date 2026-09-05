import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getS3Client, getStorageConfig } from '@/lib/objectStorage'
import { PutObjectCommand } from '@aws-sdk/client-s3'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB
const ALLOWED_TYPES = ['image/png', 'image/svg+xml', 'image/jpeg', 'image/jpg']

/**
 * POST /api/app/account/logo-upload
 * Server-side logo upload. Accepts multipart form: file, account.
 * Uploads to S3, returns logoUrl. Avoids CORS issues with direct presigned PUT.
 */
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || ''
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ success: false, error: 'Expect multipart/form-data' }, { status: 400 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const accountSlug = formData.get('account') as string | null

    if (!file || !accountSlug) {
      return NextResponse.json({ success: false, error: 'file and account required' }, { status: 400 })
    }

    const mimeType = file.type.split(';')[0].trim()
    if (!ALLOWED_TYPES.includes(mimeType)) {
      return NextResponse.json({ success: false, error: 'Invalid file type. Use PNG, JPG, or SVG.' }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, error: 'Logo must be under 2MB' }, { status: 400 })
    }

    const account = await prisma.account.findUnique({
      where: { slug: accountSlug },
      select: { id: true },
    })
    if (!account) {
      return NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 })
    }

    const config = getStorageConfig()
    if (!config) {
      return NextResponse.json({ success: false, error: 'Storage not configured' }, { status: 500 })
    }

    const ext = (file.name.split('.').pop() || 'png').toLowerCase()
    const key = `branding/${account.id}/logo-${Date.now()}.${ext}`

    const buffer = Buffer.from(await file.arrayBuffer())
    const client = getS3Client()

    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      })
    )

    const logoUrl = `/api/app/logo?key=${encodeURIComponent(key)}`

    return NextResponse.json({
      success: true,
      logoUrl,
      key,
    })
  } catch (error) {
    console.error('[API] logo-upload error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    )
  }
}
