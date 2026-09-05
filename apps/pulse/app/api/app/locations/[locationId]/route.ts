import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAccountMembership } from '@/lib/auth/require-account-membership'

/**
 * GET /api/app/locations/[locationId]
 * Get a single location by ID
 */
export async function GET(
    request: NextRequest,
    { params }: { params: { locationId: string } }
) {
    try {
        const { locationId } = params

        const accountSlug = request.nextUrl.searchParams.get('account')
        const membership = await requireAccountMembership(accountSlug)
        if (!membership.ok) return membership.response

        // Get location and verify it belongs to user's account
        const location = await prisma.location.findFirst({
            where: {
                id: locationId,
                accountId: membership.account.id
            },
            include: {
                _count: {
                    select: {
                        events: true
                    }
                }
            }
        })

        if (!location) {
            return NextResponse.json({ error: 'Location not found' }, { status: 404 })
        }

        return NextResponse.json({
            success: true,
            location
        })
    } catch (error: any) {
        console.error('[API] Error fetching location:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to fetch location' },
            { status: 500 }
        )
    }
}

/**
 * PATCH /api/app/locations/[locationId]
 * Update a location
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: { locationId: string } }
) {
    try {
        const { locationId } = params
        const body = await request.json()
        const { name, address, city, state, postalCode, googleReviewUrl, isActive } = body

        const accountSlug = request.nextUrl.searchParams.get('account')
        const membership = await requireAccountMembership(accountSlug)
        if (!membership.ok) return membership.response

        // Verify location belongs to account
        const existingLocation = await prisma.location.findFirst({
            where: {
                id: locationId,
                accountId: membership.account.id
            }
        })

        if (!existingLocation) {
            return NextResponse.json({ error: 'Location not found' }, { status: 404 })
        }

        // Validate googleReviewUrl if provided
        if (googleReviewUrl && googleReviewUrl.trim() && !googleReviewUrl.startsWith('https://')) {
            return NextResponse.json({ error: 'Google Review URL must start with https://' }, { status: 400 })
        }

        // Update location
        const updateData: any = {}
        if (name !== undefined) updateData.name = name.trim()
        if (address !== undefined) updateData.address = address?.trim() || null
        if (city !== undefined) updateData.city = city?.trim() || null
        if (state !== undefined) updateData.state = state?.trim() || null
        if (postalCode !== undefined) updateData.postalCode = postalCode?.trim() || null
        if (googleReviewUrl !== undefined) updateData.googleReviewUrl = googleReviewUrl?.trim() || null
        if (isActive !== undefined) updateData.isActive = isActive

        const updatedLocation = await prisma.location.update({
            where: { id: locationId },
            data: updateData,
            include: {
                _count: {
                    select: {
                        events: true
                    }
                }
            }
        })

        return NextResponse.json({
            success: true,
            location: updatedLocation
        })
    } catch (error: any) {
        console.error('[API] Error updating location:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to update location' },
            { status: 500 }
        )
    }
}

/**
 * DELETE /api/app/locations/[locationId]
 * Delete a location
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: { locationId: string } }
) {
    try {
        const { locationId } = params

        const accountSlug = request.nextUrl.searchParams.get('account')
        const membership = await requireAccountMembership(accountSlug)
        if (!membership.ok) return membership.response

        // Verify location belongs to account
        const existingLocation = await prisma.location.findFirst({
            where: {
                id: locationId,
                accountId: membership.account.id
            },
            include: {
                _count: {
                    select: {
                        events: true
                    }
                }
            }
        })

        if (!existingLocation) {
            return NextResponse.json({ error: 'Location not found' }, { status: 404 })
        }

        // Check if location has events
        if (existingLocation._count.events > 0) {
            return NextResponse.json(
                { error: 'Cannot delete location with existing events' },
                { status: 400 }
            )
        }

        // Delete location
        await prisma.location.delete({
            where: { id: locationId }
        })

        return NextResponse.json({
            success: true,
            message: 'Location deleted successfully'
        })
    } catch (error: any) {
        console.error('[API] Error deleting location:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to delete location' },
            { status: 500 }
        )
    }
}
