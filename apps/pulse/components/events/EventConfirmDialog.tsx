'use client'

import type { ReactNode } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

/**
 * Canonical Events confirmation dialog over the shared SignalThread Modal.
 * Replaces native window.confirm() in Events setup flows: Escape, the close
 * button, and outside click all cancel without mutating; the single primary
 * action carries specific copy (e.g. "Add session"), and the Modal returns
 * focus to the trigger on close.
 */
export interface EventConfirmDialogProps {
  open: boolean
  title: string
  body: ReactNode
  confirmLabel: string
  cancelLabel?: string
  /** Use the danger treatment for destructive confirmations. */
  destructive?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function EventConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: EventConfirmDialogProps) {
  return (
    // z-[80]: confirmations triggered from inside the z-[70] session drawer
    // must layer above it.
    <Modal isOpen={open} onClose={onCancel} title={title} overlayZIndexClassName="z-[80]">
      <div className="text-sm text-zinc-600 dark:text-zinc-300">{body}</div>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy} data-autofocus>
          {cancelLabel}
        </Button>
        <Button type="button" variant={destructive ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>
          {busy ? 'Working…' : confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
