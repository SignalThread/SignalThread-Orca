import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const source = fs.readFileSync(path.join(process.cwd(), 'components/events/EventBriefPdfDownloadButton.tsx'), 'utf8')

describe('EventBriefPdfDownloadButton', () => {
  it('downloads the authenticated PDF as a blob instead of navigating to an API response', () => {
    expect(source).toContain("fetch(pdfHref, { credentials: 'include', cache: 'no-store' })")
    expect(source).toContain("includes('application/pdf')")
    expect(source).toContain('URL.createObjectURL(blob)')
    expect(source).toContain('anchor.download = filename')
    expect(source).not.toContain('window.open')
  })

  it('keeps PDF errors in the product UI', () => {
    expect(source).toContain('role="alert"')
    expect(source).toContain('Unable to download the Event Intelligence Brief PDF.')
  })
})
