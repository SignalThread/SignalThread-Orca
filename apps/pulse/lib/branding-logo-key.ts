/**
 * Only account branding assets may be served through the public logo proxy.
 * Logo keys are minted by the organizer upload routes as
 * `branding/{accountId}/logo-{timestamp}.{ext}`; nothing else in the bucket
 * (answer audio, TTS cache, exports) is reachable through that proxy.
 */
const BRANDING_LOGO_KEY = /^branding\/[A-Za-z0-9_-]{1,64}\/[A-Za-z0-9_-]{1,80}\.(png|jpe?g|svg|webp|gif)$/i

export function isServableBrandingLogoKey(key: string): boolean {
  return BRANDING_LOGO_KEY.test(key) && !key.includes('..')
}
