import { NextRequest, NextResponse } from 'next/server'
import { requireAccountMembership } from '@/lib/auth/require-account-membership'
import { presignPut, getStorageConfig } from '@/lib/objectStorage'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB
const ALLOWED_TYPES = ['image/png', 'image/svg+xml', 'image/jpeg', 'image/jpg']

const schema = z.object({
  account: z.string().min(1),
  fileName: z.string().min(1).max(255),
  fileSize: z.number().int().positive().max(MAX_FILE_SIZE),
  mimeType: z.string().refine(t => ALLOWED_TYPES.includes(t.split(';')[0].trim()), 'Invalid type'),
})

/**
 * POST /api/app/account/logo-presign
 * Get presigned URL for logo upload. Key format: branding/{accountId}/logo-{ts}.{ext}
 *
 * Organizer-authenticated: the caller must be a member of the account named
 * in the body (same guard as the settings PATCH that stores the logo URL).
 */
export async function POST(request: NextRequest) {
  try {
    const config = getStorageConfig()
    if (!config) {
      return NextResponse.json({ success: false, error: 'Storage not configured' }, { status: 500 })
    }

    const body = await request.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.message }, { status: 400 })
    }

    const { account: accountSlug, fileName, fileSize, mimeType } = parsed.data

    const membership = await requireAccountMembership(accountSlug, { allowSuperAdmin: true })
    if (!membership.ok) return membership.response
    const account = membership.account

    const ext = (fileName.split('.').pop() || 'png').toLowerCase()
    const key = `branding/${account.id}/logo-${Date.now()}.${ext}`

    const bucket = config.bucket
    const expiresIn = parseInt(process.env.S3_UPLOAD_EXPIRES_IN || '300', 10)

    const url = await presignPut({
      bucket,
      key,
      contentType: mimeType.split(';')[0].trim(),
      expiresIn,
    })

    const logoUrl = `/api/app/logo?key=${encodeURIComponent(key)}`

    return NextResponse.json({
      success: true,
      url,
      key,
      logoUrl,
      expiresIn,
    })
  } catch (error) {
    console.error('[API] logo-presign error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to generate upload URL' },
      { status: 500 }
    )
  }
}
