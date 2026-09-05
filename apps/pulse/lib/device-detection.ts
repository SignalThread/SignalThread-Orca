/**
 * Detects if the current device is iOS (iPhone or iPad).
 * Everything else is considered non-iOS.
 */
export function isIOS(): boolean {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
        return false
    }

    const userAgent = navigator.userAgent.toLowerCase()

    // Check for iPhone or iPad in user agent; iPadOS 13+ may report as Mac
    return /iphone|ipad|ipod/.test(userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/**
 * Detects iOS Safari specifically (not Chrome/Firefox in-app on iOS).
 * Used for QR download workarounds where Safari opens a file viewer instead of showing the image.
 */
export function isIOSSafari(): boolean {
    if (!isIOS()) return false
    const ua = navigator.userAgent
    return /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
}
