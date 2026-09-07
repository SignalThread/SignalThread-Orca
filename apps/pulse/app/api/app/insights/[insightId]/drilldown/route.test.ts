import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
import { getRequest, makeRouteParams } from '@/tests/helpers/route'

const { requireAccountMembershipMock, getInsightDrilldownForAccountMock } = vi.hoisted(() => ({
  requireAccountMembershipMock: vi.fn(),
  getInsightDrilldownForAccountMock: vi.fn(),
}))

vi.mock('@/lib/auth/require-account-membership', () => ({ requireAccountMembership: requireAccountMembershipMock }))
vi.mock('@/lib/insights/drilldown', () => ({ getInsightDrilldownForAccount: getInsightDrilldownForAccountMock }))

const params = makeRouteParams({ insightId: 'insight_1' })
const url = 'http://localhost/api/app/insights/insight_1/drilldown?account=retail-co&sentiment=negative&page=2&pageSize=15'

describe('GET /api/app/insights/[insightId]/drilldown', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    getInsightDrilldownForAccountMock.mockResolvedValue({ items: [], total: 0 })
  })

  it('still requires an account slug', async () => {
    const { GET } = await import('./route')
    const response = await GET(getRequest('http://localhost/api/app/insights/insight_1/drilldown'), params)
    expect(response.status).toBe(400)
    expect(requireAccountMembershipMock).not.toHaveBeenCalled()
  })

  it('returns the guard response and reads no transcripts for anonymous or cross-tenant callers', async () => {
    requireAccountMembershipMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }),
    })
    const { GET } = await import('./route')
    const response = await GET(getRequest(url), params)
    expect(response.status).toBe(401)
    expect(requireAccountMembershipMock).toHaveBeenCalledWith('retail-co', { allowSuperAdmin: true })
    expect(getInsightDrilldownForAccountMock).not.toHaveBeenCalled()
  })

  it('scopes the drill-down to the authorized account id, not a caller-resolved one', async () => {
    requireAccountMembershipMock.mockResolvedValue({ ok: true, userId: 'user_1', account: { id: 'acct_authorized', slug: 'retail-co' } })
    const { GET } = await import('./route')
    const response = await GET(getRequest(url), params)
    expect(response.status).toBe(200)
    expect(getInsightDrilldownForAccountMock).toHaveBeenCalledWith('insight_1', 'acct_authorized', expect.objectContaining({ sentiment: 'negative', page: 2, pageSize: 15 }))
  })
})
