import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const source = fs.readFileSync(path.join(process.cwd(), 'components/events/EventActionVoiceUpdateRecorder.tsx'), 'utf8')

describe('EventActionVoiceUpdateRecorder', () => {
  it('uses dedicated action media operations and never attendee answer routes', () => {
    expect(source).toContain("operation: 'PRESIGN'")
    expect(source).toContain("operation: 'CONFIRM'")
    expect(source).toContain("operation: 'CONFIRM', objectKey: presign.key")
    expect(source).not.toContain('/api/answer/')
  })

  it('provides accessible touch-sized recording controls and durable user feedback', () => {
    expect(source).toContain('Record a voice update')
    expect(source).toContain('Stop and save')
    expect(source).toContain('min-h-11')
    expect(source).toContain('aria-live="polite"')
  })
})
