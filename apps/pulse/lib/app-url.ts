import type { NextRequest } from 'next/server'

/**
 * Canonical base URL for this Next app (Voice / Booth Audio): invite emails, magic links, auth/callback redirects.
 * Prefer NEXT_PUBLIC_APP_URL in every environment; production fallback matches the live Voice deployment host.
 */
export function getAppUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (fromEnv) {
    return fromEnv.replace(/\/$/, '')
  }
  if (process.env.NODE_ENV === 'production') {
    return 'https://voice.signalthread.ai'
  }
  return 'http://localhost:3000'
}

/**
 * Base URL for Stripe Customer Portal `return_url` (must match the app host users use, e.g. live app domain).
 * Priority: BILLING_PORTAL_RETURN_URL_BASE → APP_BASE_URL → request proxy headers (x-forwarded-*) → getAppUrl().
 */
export function getBillingPortalReturnBaseUrl(request: NextRequest): string {
  const fromBilling = process.env.BILLING_PORTAL_RETURN_URL_BASE?.trim()
  if (fromBilling) {
    return fromBilling.replace(/\/$/, '')
  }
  const fromAppBase = process.env.APP_BASE_URL?.trim()
  if (fromAppBase) {
    return fromAppBase.replace(/\/$/, '')
  }

  const forwardedHost = request.headers.get('x-forwarded-host')
  if (forwardedHost) {
    const host = forwardedHost.split(',')[0].trim()
    const rawProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
    const proto =
      rawProto === 'http' || rawProto === 'https'
        ? rawProto
        : request.nextUrl.protocol === 'https:'
          ? 'https'
          : 'http'
    return `${proto}://${host}`
  }

  return getAppUrl()
}
