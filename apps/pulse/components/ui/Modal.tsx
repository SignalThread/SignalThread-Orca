'use client'

import { useEffect, useRef } from 'react'

interface ModalProps {
    isOpen: boolean
    onClose: () => void
    title: string
    children: React.ReactNode
    /** Overlay z-index class; pass a higher layer when the modal must sit above a drawer. */
    overlayZIndexClassName?: string
}

export function Modal({ isOpen, onClose, title, children, overlayZIndexClassName = 'z-50' }: ModalProps) {
    const modalRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        // Capture phase + stopPropagation: an open modal is the top-most layer,
        // so Escape must close it alone and never also reach an underlying
        // drawer or page-level Escape handler.
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation()
                onClose()
            }
        }

        if (isOpen) {
            document.addEventListener('keydown', handleEscape, true)
            document.body.style.overflow = 'hidden'
        }

        return () => {
            document.removeEventListener('keydown', handleEscape, true)
            document.body.style.overflow = 'unset'
        }
    }, [isOpen, onClose])

    // Focus management: move focus into the dialog on open (honoring
    // [data-autofocus]), keep Tab cycling inside it, and return focus to the
    // element that opened it on close.
    useEffect(() => {
        if (!isOpen) return
        const previouslyFocused = document.activeElement as HTMLElement | null
        const focusables = () =>
            Array.from(
                modalRef.current?.querySelectorAll<HTMLElement>(
                    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
                ) ?? [],
            ).filter((el) => !el.hasAttribute('disabled'))
        const initial = modalRef.current?.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0]
        initial?.focus()

        const handleTab = (e: KeyboardEvent) => {
            if (e.key !== 'Tab') return
            const items = focusables()
            if (items.length === 0) return
            const first = items[0]
            const last = items[items.length - 1]
            const active = document.activeElement
            if (e.shiftKey && (active === first || !modalRef.current?.contains(active))) {
                e.preventDefault()
                last.focus()
            } else if (!e.shiftKey && (active === last || !modalRef.current?.contains(active))) {
                e.preventDefault()
                first.focus()
            }
        }
        document.addEventListener('keydown', handleTab)
        return () => {
            document.removeEventListener('keydown', handleTab)
            previouslyFocused?.focus?.()
        }
    }, [isOpen])

    if (!isOpen) return null

    return (
        <div
            className={`fixed inset-0 ${overlayZIndexClassName} flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm`}
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose()
            }}
        >
            <div
                ref={modalRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-title"
                className="bg-white dark:bg-zinc-900 rounded-lg shadow-2xl max-w-md w-full border border-zinc-200 dark:border-zinc-800"
            >
                <div className="flex items-center justify-between p-5 border-b border-zinc-200 dark:border-zinc-800">
                    <h2 id="modal-title" className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{title}</h2>
                    <button
                        onClick={onClose}
                        className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                        aria-label="Close"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="p-5">
                    {children}
                </div>
            </div>
        </div>
    )
}
