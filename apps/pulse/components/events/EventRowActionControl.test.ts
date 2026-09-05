import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const source = fs.readFileSync(path.join(process.cwd(), 'components/events/EventRowActionControl.tsx'), 'utf8')

describe('EventRowActionOverflow', () => {
  it('uses the shared portaled menu layer with collision-aware positioning', () => {
    expect(source).toContain("import { createPortal } from 'react-dom'")
    expect(source).toContain('createPortal(')
    expect(source).toContain('document.body')
    expect(source).toContain("data-placement={position?.placement ?? 'bottom'}")
    expect(source).toContain("const placement = below < menuHeight + gap && above > below ? 'top' : 'bottom'")
  })

  it('closes on outside pointer interaction and Escape', () => {
    expect(source).toContain("document.addEventListener('pointerdown', onPointerDown)")
    expect(source).toContain("if (event.key === 'Escape')")
    expect(source).toContain('aria-expanded={open}')
  })

  it('runs a menu action before closing the portaled panel and prevents row click-through', () => {
    expect(source).toContain('onClick={(event) => { event.stopPropagation(); setMenuOpen(false) }}')
    expect(source).toContain('onClick={(event) => { event.stopPropagation(); setMenuOpen(!open) }}')
    expect(source).not.toContain('onClickCapture={() => setMenuOpen(false)}')
  })

  it('allows a caller to size a portaled menu without losing the shared layer', () => {
    expect(source).toContain('menuClassName = \'\'')
    expect(source).toContain('${menuClassName}')
    expect(source).toContain('triggerClassName = \'\'')
    expect(source).toContain('${triggerClassName}')
  })

  it('lets callers reset nested menu state when the menu closes', () => {
    expect(source).toContain('onOpenChange?: (open: boolean) => void')
    expect(source).toContain('onOpenChange?.(next)')
  })
})
