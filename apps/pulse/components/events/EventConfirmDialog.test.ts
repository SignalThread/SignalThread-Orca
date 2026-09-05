import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const dialogSource = readFileSync('components/events/EventConfirmDialog.tsx', 'utf8')
const modalSource = readFileSync('components/ui/Modal.tsx', 'utf8')

describe('EventConfirmDialog', () => {
  it('composes the canonical SignalThread Modal with Cancel and a specific primary action', () => {
    expect(dialogSource).toContain("import { Modal } from '@/components/ui/Modal'")
    expect(dialogSource).toContain('<Modal isOpen={open} onClose={onCancel} title={title} overlayZIndexClassName="z-[80]">')
    expect(dialogSource).toContain("cancelLabel = 'Cancel'")
    expect(dialogSource).toContain("{busy ? 'Working…' : confirmLabel}")
    // Escape and outside click route through onClose → onCancel, never confirm.
    expect(dialogSource).not.toContain('onClose={onConfirm}')
  })

  it('supports destructive and busy treatments', () => {
    expect(dialogSource).toContain("variant={destructive ? 'danger' : 'primary'}")
    expect(dialogSource).toContain('disabled={busy}')
  })

  it('gives initial focus to the safe Cancel action', () => {
    expect(dialogSource).toContain('data-autofocus')
  })
})

describe('canonical Modal focus management', () => {
  it('moves focus into the dialog, traps Tab, and returns focus to the trigger', () => {
    expect(modalSource).toContain('const previouslyFocused = document.activeElement as HTMLElement | null')
    expect(modalSource).toContain("modalRef.current?.querySelector<HTMLElement>('[data-autofocus]')")
    expect(modalSource).toContain("if (e.key !== 'Tab') return")
    expect(modalSource).toContain('previouslyFocused?.focus?.()')
  })

  it('keeps Escape and outside-click dismissal, with Escape consumed by the top-most layer', () => {
    // Capture + stopPropagation so Escape closes only the modal, never an
    // underlying drawer or page-level handler at the same time.
    expect(modalSource).toContain("if (e.key === 'Escape') {")
    expect(modalSource).toContain('e.stopPropagation()')
    expect(modalSource).toContain("document.addEventListener('keydown', handleEscape, true)")
    expect(modalSource).toContain('if (e.target === e.currentTarget) onClose()')
  })
})
