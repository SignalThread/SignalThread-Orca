import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import {
  inviteOrResendAccountUser,
  listRetailAccountUsersAndInvites,
  ACCOUNT_INVITE_ROLES,
  requireRetailAccountUserManager,
} from '@/lib/account-users'
import type { UserRole } from '@prisma/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const inviteBodySchema = z.object({
  email: z.string().email(),
  firstName: z.string().max(120).optional().default(''),
  lastName: z.string().max(120).optional().default(''),
  role: z.enum(['ADMIN', 'MANAGER', 'VIEWER']),
})

function jsonFromUnexpectedError(e: unknown, label: string) {
  console.error(`[${label}]`, e)
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2022') {
    return NextResponse.json(
      {
        success: false,
        error: 'database_schema',
        message:
          'Database is missing required columns for team invites. Run `npx prisma migrate deploy` on this environment.',
      },
      { status: 503 }
    )
  }
  return NextResponse.json(
    {
      success: false,
      error: 'internal_error',
      message: e instanceof Error ? e.message : 'Unexpected server error',
    },
    { status: 500 }
  )
}

export async function GET(request: NextRequest) {
  try {
    const accountSlug = request.nextUrl.searchParams.get('account')
    const auth = await requireRetailAccountUserManager(accountSlug)
    if (!auth.ok) return auth.response

    const { users, pendingInvites } = await listRetailAccountUsersAndInvites(auth.account.id)
    return NextResponse.json({
      success: true,
      data: {
        users,
        pendingInvites,
        inviteRoles: ACCOUNT_INVITE_ROLES,
      },
    })
  } catch (e) {
    return jsonFromUnexpectedError(e, 'GET /api/app/account/users')
  }
}

export async function POST(request: NextRequest) {
  try {
    const accountSlug = request.nextUrl.searchParams.get('account')
    const auth = await requireRetailAccountUserManager(accountSlug)
    if (!auth.ok) return auth.response

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
    }

    const parsed = inviteBodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', message: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const result = await inviteOrResendAccountUser({
      accountId: auth.account.id,
      email: parsed.data.email,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      role: parsed.data.role as UserRole,
    })

    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.code, message: result.message },
        { status: result.status }
      )
    }

    return NextResponse.json({
      success: true,
      data: { kind: result.kind },
      message: result.kind === 'invite_resent'
        ? 'Invite resent'
        : result.kind === 'access_added'
          ? 'Account access added'
          : 'Invitation sent',
    })
  } catch (e) {
    return jsonFromUnexpectedError(e, 'POST /api/app/account/users')
  }
}
