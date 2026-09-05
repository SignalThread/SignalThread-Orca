import { isIOSSafari } from './device-detection'

/**
 * Share or download a QR code PNG blob.
 * - If Web Share API supports files: use navigator.share
 * - If iOS Safari: open in new tab with image (press-and-hold to save)
 * - Else: trigger download via <a download>
 */
export async function shareOrDownloadQR(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: 'image/png' })

  // 1. Try Web Share API if it supports files
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'QR Code',
      })
      return
    } catch (err) {
      // User cancelled or share failed; fall through to other methods
      if ((err as Error)?.name === 'AbortError') return
    }
  }

  // 2. iOS Safari: open new tab with image so user can press-and-hold to save
  if (isIOSSafari()) {
    const url = URL.createObjectURL(blob)
    const w = window.open('', '_blank')
    if (w) {
      w.document.write(`
        <!DOCTYPE html>
        <html>
        <head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
        <body style="margin:0;padding:16px;font-family:system-ui,sans-serif;background:#111;color:#fff;display:flex;flex-direction:column;align-items:center;min-height:100vh;box-sizing:border-box;">
          <img src="${url}" alt="QR Code" style="max-width:100%;height:auto;display:block;" />
          <p style="margin-top:16px;font-size:14px;color:#9ca3af;">Press and hold the image to save.</p>
        </body>
        </html>
      `)
      w.document.close()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } else {
      // Popup blocked; fall back to download
      fallbackDownload(blob, filename)
    }
    return
  }

  // 3. Desktop: standard download
  fallbackDownload(blob, filename)
}

function fallbackDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
