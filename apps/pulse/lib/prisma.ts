import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Extract host:port from DATABASE_URL for logging (never log full connection string)
function getConnectionInfo(url: string | undefined): string {
  if (!url) return 'undefined'
  try {
    const parsed = new URL(url)
    return `${parsed.hostname}:${parsed.port || '5432'}`
  } catch {
    return 'invalid-url'
  }
}

// Lazy initialization: create PrismaClient only on first actual use (not at import time)
// This prevents build-time crashes when DATABASE_URL is unavailable
function createPrismaClient(): PrismaClient {
  console.log('[Prisma] Creating new PrismaClient instance')
  console.log('[Prisma] DATABASE_URL host:', getConnectionInfo(process.env.DATABASE_URL))
  console.log('[Prisma] DIRECT_URL host:', getConnectionInfo(process.env.DIRECT_URL))

  const client = new PrismaClient({
    // Per-query logging is intentionally opt-in. Printing every SQL statement
    // materially distorts local request timings and can dominate large seeded
    // dashboard reads; route/stage timing remains available independently.
    log: process.env.PRISMA_QUERY_LOG === 'true'
      ? ['query', 'error', 'warn']
      : process.env.NODE_ENV === 'development'
        ? ['error', 'warn']
        : ['error'],
  })

  // Cache in global singleton
  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = client
  }

  return client
}

function getPrisma(): PrismaClient {
  // Return cached instance if exists
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma
  }
  
  // Otherwise create and cache
  const client = createPrismaClient()
  globalForPrisma.prisma = client
  return client
}

// Export a Proxy that delays initialization until first property access
// This allows "import { prisma } from '@/lib/prisma'" to work without executing at import time
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrisma() as any
    const value = client[prop]
    return typeof value === 'function' ? value.bind(client) : value
  },
})
