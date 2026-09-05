import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Force dynamic rendering
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/health/db
 * 
 * Database health check - tests Prisma connection with SELECT 1
 * Returns ok:true if connection succeeds, ok:false with error details if it fails
 */
export async function GET() {
  const startTime = Date.now()
  
  // Log connection info (redacted)
  const databaseUrl = process.env.DATABASE_URL || 'undefined'
  const directUrl = process.env.DIRECT_URL || 'undefined'
  
  function redactUrl(url: string): string {
    if (url === 'undefined') return 'undefined'
    try {
      const parsed = new URL(url)
      const password = parsed.password
      const redacted = password ? url.replace(password, '***') : url
      return redacted
    } catch {
      return 'invalid-url'
    }
  }
  
  console.log('[Health Check] DATABASE_URL:', redactUrl(databaseUrl))
  console.log('[Health Check] DIRECT_URL:', redactUrl(directUrl))
  
  try {
    // Simple SELECT 1 query to test connectivity
    await prisma.$queryRaw`SELECT 1 as test`
    
    const duration = Date.now() - startTime
    console.log(`[Health Check] ✅ Database connection OK (${duration}ms)`)
    
    return NextResponse.json({
      ok: true,
      duration,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    const duration = Date.now() - startTime
    
    console.error('[Health Check] ❌ Database connection FAILED:', {
      code: error.code,
      message: error.message,
      duration,
    })
    
    return NextResponse.json(
      {
        ok: false,
        code: error.code || 'UNKNOWN_ERROR',
        message: error.message || 'Database connection failed',
        duration,
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    )
  }
}
