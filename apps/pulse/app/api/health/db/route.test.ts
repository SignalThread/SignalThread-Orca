import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { prismaMock } = vi.hoisted(() => ({ prismaMock: { $queryRaw: vi.fn() } }))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

describe('GET /api/health/db', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('reports ok when the database answers', async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ test: 1 }])
    const { GET } = await import('./route')
    const response = await GET()
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ ok: true })
  })

  it('keeps database error codes and messages out of the production response', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    prismaMock.$queryRaw.mockRejectedValue(Object.assign(new Error('FATAL: password authentication failed for user "postgres"'), { code: 'P1000' }))
    const { GET } = await import('./route')
    const response = await GET()
    expect(response.status).toBe(503)
    const json = await response.json()
    expect(json).toMatchObject({ ok: false })
    expect(json).not.toHaveProperty('code')
    expect(json).not.toHaveProperty('message')
  })

  it('still surfaces diagnostics outside production', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    prismaMock.$queryRaw.mockRejectedValue(Object.assign(new Error('connect ECONNREFUSED'), { code: 'P1001' }))
    const { GET } = await import('./route')
    const json = await (await GET()).json()
    expect(json).toMatchObject({ ok: false, code: 'P1001', message: 'connect ECONNREFUSED' })
  })
})
