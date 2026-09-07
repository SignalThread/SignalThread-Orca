import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }))

vi.mock('@/lib/objectStorage', () => ({
  getStorageConfig: () => ({ bucket: 'uploads', provider: 'r2' }),
  getS3Client: () => ({ send: sendMock }),
}))

const get = (key: string) => new NextRequest(`http://localhost/api/app/logo?key=${encodeURIComponent(key)}`)

describe('GET /api/app/logo', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    sendMock.mockResolvedValue({
      ContentType: 'image/png',
      Body: { transformToByteArray: async () => new Uint8Array([137, 80, 78, 71]) },
    })
  })

  it.each([
    'answers/clanswer00000000000000001/recording.webm',
    'tts/abc123.mp3',
    'branding/../answers/recording.webm',
    '/branding/acct_1/logo-1.png',
    'branding/acct_1/logo-1.png/../../secret.json',
    'branding/acct_1/export.csv',
    'branding/acct_1/logo-1.png?x=1',
    'exports/acct_1/responses.xlsx',
  ])('refuses to proxy non-branding object key %s', async (key) => {
    const { GET } = await import('./route')
    const response = await GET(get(key))
    expect(response.status).toBe(400)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('serves a branding logo object publicly for the kiosk and consent screens', async () => {
    const { GET } = await import('./route')
    const response = await GET(get('branding/clacct000000000000000001/logo-1757000000000.png'))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(sendMock.mock.calls[0][0].input).toEqual({ Bucket: 'uploads', Key: 'branding/clacct000000000000000001/logo-1757000000000.png' })
  })

  it('does not serve a branding-prefixed object whose stored content type is not an image', async () => {
    sendMock.mockResolvedValue({ ContentType: 'text/html', Body: { transformToByteArray: async () => new Uint8Array([60]) } })
    const { GET } = await import('./route')
    const response = await GET(get('branding/acct_1/logo-2.svg'))
    expect(response.status).toBe(404)
  })

  it('exposes the key policy for reuse', async () => {
    const { isServableBrandingLogoKey } = await import('@/lib/branding-logo-key')
    expect(isServableBrandingLogoKey('branding/acct_1/logo-1.JPG')).toBe(true)
    expect(isServableBrandingLogoKey('branding/acct_1/logo-1.webm')).toBe(false)
  })
})
