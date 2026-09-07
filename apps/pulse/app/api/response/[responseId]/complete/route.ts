import { NextRequest, NextResponse } from 'next/server'
import { completeResponse, ResponseCompletionError } from '@/lib/event'
import type { ApiResponse } from '@/types'

// Force dynamic rendering
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/response/[responseId]/complete
 * 
 * Mark a Response as COMPLETED after all questions answered
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { responseId: string } }
) {
  try {
    const { responseId } = params

    if (!responseId) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: 'Missing responseId',
        },
        { status: 400 }
      )
    }

    // Mark response as completed
    const response = await completeResponse(responseId)

    return NextResponse.json<ApiResponse>(
      {
        success: true,
        data: {
          responseId: response.id,
          status: response.status,
          completedAt: response.completedAt,
        },
        message: 'Response marked as completed',
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Error completing response:', error)

    const status = error instanceof ResponseCompletionError ? error.status : 500
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error: status === 404 ? 'Response not found' : status === 409 ? 'Response incomplete' : 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status }
    )
  }
}
