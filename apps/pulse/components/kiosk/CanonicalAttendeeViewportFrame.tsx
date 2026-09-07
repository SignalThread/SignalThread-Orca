'use client'

import { useCallback, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export const CANONICAL_ATTENDEE_VIEWPORT = { width: 430, height: 844 } as const

/**
 * Hosts the canonical attendee renderer in a real mobile document viewport.
 * The iframe establishes the same responsive CSS environment as a phone;
 * previews scale only this finished viewport and never reflow its contents.
 */
export function CanonicalAttendeeViewportFrame({ variant, children }: { variant: 'inline' | 'full'; children: ReactNode }) {
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const initializedRef = useRef(false)
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null)
  const scale = variant === 'inline' ? 0.76 : 1

  const initializeFrame = useCallback(() => {
    const frame = frameRef.current
    const document = frame?.contentDocument
    if (!document || initializedRef.current) return
    initializedRef.current = true

    const copiedStyles = Array.from(window.document.querySelectorAll('link[rel="stylesheet"], style'))
      .map((node) => node.outerHTML)
      .join('')

    document.open()
    document.write(`<!doctype html><html><head><base href="${window.location.origin}/">${copiedStyles}<style>html,body{margin:0;min-height:100%;background:#fff}</style></head><body></body></html>`)
    document.close()
    setMountNode(document.body)
  }, [])

  return (
    <div
      data-testid={`canonical-attendee-viewport-frame-${variant}`}
      className="overflow-hidden rounded-[26px] border-[6px] border-slate-950 bg-white shadow-lg"
      style={{ width: `${CANONICAL_ATTENDEE_VIEWPORT.width * scale}px`, height: `${CANONICAL_ATTENDEE_VIEWPORT.height * scale}px` }}
    >
      <iframe
        ref={frameRef}
        title="Attendee experience preview"
        onLoad={initializeFrame}
        className="block border-0"
        style={{ width: `${CANONICAL_ATTENDEE_VIEWPORT.width}px`, height: `${CANONICAL_ATTENDEE_VIEWPORT.height}px`, transform: `scale(${scale})`, transformOrigin: 'top left' }}
      />
      {mountNode ? createPortal(children, mountNode) : null}
    </div>
  )
}
