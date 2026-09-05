import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { isTwoLineTextTruncated } from './TruncatedTableText'

const source = fs.readFileSync(path.join(process.cwd(), 'components/events/TruncatedTableText.tsx'), 'utf8')

describe('TruncatedTableText', () => {
  it('detects only content that exceeds the fixed two-line cell', () => {
    expect(isTwoLineTextTruncated({ clientHeight: 40, scrollHeight: 40, clientWidth: 170, scrollWidth: 170 })).toBe(false)
    expect(isTwoLineTextTruncated({ clientHeight: 40, scrollHeight: 61, clientWidth: 170, scrollWidth: 170 })).toBe(true)
    expect(isTwoLineTextTruncated({ clientHeight: 40, scrollHeight: 40, clientWidth: 170, scrollWidth: 190 })).toBe(true)
  })

  it('uses a focusable explicit two-line clamp and a viewport-safe product tooltip only for truncated values', () => {
    expect(source).toContain("WebkitLineClamp: 2")
    expect(source).toContain('tabIndex={truncated ? 0 : -1}')
    expect(source).toContain('role="tooltip"')
    expect(source).toContain('createPortal')
    expect(source).toContain('maxHeight')
    expect(source).toContain('measureUnclampedHeight(element) > element.clientHeight + 1')
    expect(source).toContain('onFocus={show}')
    expect(source).toContain('onMouseEnter={show}')
    expect(source).toContain('onMouseLeave={hide}')
    expect(source).toContain('setTimeout(() => setOpen(false), 120)')
    expect(source).not.toContain('title=')
  })
})
