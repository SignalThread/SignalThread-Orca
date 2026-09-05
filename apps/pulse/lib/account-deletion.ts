import { DeleteObjectCommand } from '@aws-sdk/client-s3'
import { prisma } from './prisma'
import { createAdminClient } from './supabase/admin'
import { getS3Client } from './objectStorage'

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; message: string; status: number }

/**
 * Hard-delete an account and all Prisma-cascaded data. Cleans legacy Session rows,
 * best-effort S3 objects, and identities whose final account membership is
 * being removed. Multi-account users keep their Prisma and Supabase identities.
 * Does not call Stripe cancel APIs — logs Stripe IDs for manual cleanup if present.
 */
export async function deleteAccountAsSuperAdmin(
  accountId: string,
  confirmName: string
): Promise<DeleteAccountResult> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      name: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
    },
  })

  if (!account) {
    return { ok: false, message: 'Account not found', status: 404 }
  }

  if (confirmName !== account.name) {
    return { ok: false, message: 'Confirmation name does not match account name', status: 400 }
  }

  if (account.stripeCustomerId || account.stripeSubscriptionId) {
    console.warn(
      '[deleteAccount] Stripe customer/subscription refs present — cancel subscription or delete customer in Stripe Dashboard if required:',
      {
        accountId,
        stripeCustomerId: account.stripeCustomerId,
        stripeSubscriptionId: account.stripeSubscriptionId,
      }
    )
  }

  const accountUsers = await prisma.user.findMany({
    where: { accountMemberships: { some: { accountId } } },
    select: {
      id: true,
      accountId: true,
      accountMemberships: {
        where: { accountId: { not: accountId } },
        select: { accountId: true },
        orderBy: [{ createdAt: 'asc' }, { accountId: 'asc' }],
      },
    },
  })
  const usersLosingFinalAccount = accountUsers.filter((user) => user.accountMemberships.length === 0)
  const usersNeedingNewPrimary = accountUsers.filter((user) => (
    user.accountId === accountId && user.accountMemberships.length > 0
  ))

  const supabaseAdmin = createAdminClient()
  for (const u of usersLosingFinalAccount) {
    try {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(u.id)
      if (error) {
        console.error('[deleteAccount] Supabase auth deleteUser failed:', u.id, error.message)
      }
    } catch (e) {
      console.error('[deleteAccount] Supabase auth deleteUser exception:', u.id, e)
    }
  }

  const locations = await prisma.location.findMany({
    where: { accountId },
    select: { id: true },
  })
  const locIds = locations.map((l) => l.id)

  const events =
    locIds.length > 0
      ? await prisma.event.findMany({
          where: { locationId: { in: locIds } },
          select: { id: true },
        })
      : []
  const eventIds = events.map((e) => e.id)

  const answers =
    locIds.length > 0
      ? await prisma.answer.findMany({
          where: {
            response: {
              event: {
                locationId: { in: locIds },
              },
            },
          },
          select: { objectKey: true },
        })
      : []

  const sessions =
    locIds.length === 0 && eventIds.length === 0
      ? []
      : await prisma.session.findMany({
          where: {
            OR: [
              ...(locIds.length ? [{ locationId: { in: locIds } as const }] : []),
              ...(eventIds.length ? [{ eventId: { in: eventIds } as const }] : []),
            ],
          },
          select: { objectKey: true },
        })

  const keys = new Set<string>()
  for (const a of answers) {
    if (a.objectKey) keys.add(a.objectKey)
  }
  for (const s of sessions) {
    if (s.objectKey) keys.add(s.objectKey)
  }

  if (locIds.length || eventIds.length) {
    const sessionWhere: Array<
      { locationId: { in: string[] } } | { eventId: { in: string[] } }
    > = []
    if (locIds.length) sessionWhere.push({ locationId: { in: locIds } })
    if (eventIds.length) sessionWhere.push({ eventId: { in: eventIds } })
    if (sessionWhere.length) {
      await prisma.session.deleteMany({
        where: { OR: sessionWhere },
      })
    }
  }

  const bucket = process.env.S3_BUCKET_NAME
  if (bucket && keys.size > 0) {
    try {
      const client = getS3Client()
      for (const key of keys) {
        try {
          await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
        } catch (e) {
          console.error('[deleteAccount] S3 DeleteObject failed:', key, e)
        }
      }
    } catch (e) {
      console.error('[deleteAccount] S3 client unavailable; skipping object deletes:', e)
    }
  } else if (keys.size > 0) {
    console.warn(
      '[deleteAccount] S3 not configured; orphaned objects may remain. Sample keys:',
      [...keys].slice(0, 8)
    )
  }

  await prisma.$transaction(async (tx) => {
    for (const user of usersNeedingNewPrimary) {
      await tx.user.update({
        where: { id: user.id },
        data: { accountId: user.accountMemberships[0].accountId },
      })
    }
    if (usersLosingFinalAccount.length > 0) {
      await tx.user.deleteMany({
        where: { id: { in: usersLosingFinalAccount.map((user) => user.id) } },
      })
    }
    await tx.account.delete({ where: { id: accountId } })
  })

  console.log('[deleteAccount] Account deleted:', accountId, account.name)
  return { ok: true }
}
