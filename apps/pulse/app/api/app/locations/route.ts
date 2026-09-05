import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAccountMembership } from '@/lib/auth/require-account-membership'

/**
 * GET /api/app/locations
 * List all locations for the authenticated user's account
 */
export async function GET(request: NextRequest) {
    try {
        const accountSlug = request.nextUrl.searchParams.get('account')
        const membership = await requireAccountMembership(accountSlug)
        if (!membership.ok) return membership.response

        // Get all locations for the account
        const locations = await prisma.location.findMany({
            where: {
                accountId: membership.account.id
            },
            include: {
                _count: {
                    select: {
                        events: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        })

        return NextResponse.json({
            success: true,
            locations
        })
    } catch (error: any) {
        console.error('[API] Error fetching locations:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to fetch locations' },
            { status: 500 }
        )
    }
}

/**
 * POST /api/app/locations
 * Create a new location (enforces 1-per-account limit for Retail)
 */
export async function POST(request: NextRequest) {
    try {
        const accountSlug = request.nextUrl.searchParams.get('account')
        const membership = await requireAccountMembership(accountSlug)
        if (!membership.ok) return membership.response
        const account = membership.account

        const body = await request.json()
        const { name, address, city, state, postalCode, googleReviewUrl } = body

        // Validation
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return NextResponse.json({ error: 'Location name is required' }, { status: 400 })
        }

        // Starter: 1 max, Growth: 5 max, Enterprise: unlimited
        const tierRaw = (account.tier || 'starter').toLowerCase()
        const tier = tierRaw === 'pro' ? 'growth' : tierRaw === 'free' ? 'starter' : tierRaw
        const maxLocations =
            tier === 'starter' ? 1 :
            tier === 'growth' ? 5 :
            null

        if (maxLocations !== null) {
            const existingCount = await prisma.location.count({
                where: { accountId: account.id }
            })

            if (existingCount >= maxLocations) {
                return NextResponse.json(
                    {
                        error:
                            maxLocations === 1
                                ? 'This plan allows 1 location/team only. Upgrade to Growth to add more.'
                                : 'This plan allows up to 5 locations/teams. Upgrade to Enterprise to add more.'
                    },
                    { status: 400 }
                )
            }
        }

        // Generate slug from name
        const slug = name
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')

        // Create location
        const location = await prisma.location.create({
            data: {
                accountId: account.id,
                name: name.trim(),
                slug,
                address: address?.trim() || null,
                city: city?.trim() || null,
                state: state?.trim() || null,
                postalCode: postalCode?.trim() || null,
                googleReviewUrl: googleReviewUrl?.trim() || null,
                isActive: true
            }
        })

        return NextResponse.json({
            success: true,
            location
        }, { status: 201 })
    } catch (error: any) {
        console.error('[API] Error creating location:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to create location' },
            { status: 500 }
        )
    }
}
