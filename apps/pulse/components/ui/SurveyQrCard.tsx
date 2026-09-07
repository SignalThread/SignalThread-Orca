'use client'

import { useEffect, useRef, useState } from 'react'
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

interface SurveyQrCardProps {
  surveyName: string
  path: string
  fileName: string
  showInlineActions?: boolean
  renderTrigger?: (props: {
    open: () => void
    copyLink: () => Promise<void>
    downloadPng: () => Promise<void>
    disabled: boolean
    copied: boolean
  }) => React.ReactNode
}

export function SurveyQrCard({
  surveyName,
  path,
  fileName,
  showInlineActions = true,
  renderTrigger,
}: SurveyQrCardProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [absoluteUrl, setAbsoluteUrl] = useState('')
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setAbsoluteUrl(`${window.location.origin}${path}`)
    }
  }, [path])

  const open = () => {
    if (!absoluteUrl) return
    setIsOpen(true)
  }

  const handleCopyLink = async () => {
    if (!absoluteUrl) return
    await navigator.clipboard.writeText(absoluteUrl)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  const handleDownload = async () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), 'image/png')
    })

    if (!blob) return

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const utilityActionClass =
    'inline-flex items-center justify-center rounded-md px-1.5 py-1 text-xs font-medium text-zinc-600 transition-colors hover:text-zinc-950 disabled:pointer-events-none disabled:opacity-40 dark:text-zinc-400 dark:hover:text-zinc-100'

  return (
    <>
      {renderTrigger ? (
        renderTrigger({
          open,
          copyLink: handleCopyLink,
          downloadPng: handleDownload,
          disabled: !absoluteUrl,
          copied,
        })
      ) : (
        <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={open}
              disabled={!absoluteUrl}
              className="group flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white p-2 shadow-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/50"
              aria-label="View QR code"
            >
              {absoluteUrl ? (
                <QRCodeSVG
                  value={absoluteUrl}
                  size={64}
                  level="H"
                  marginSize={4}
                  bgColor="#FFFFFF"
                  fgColor="#111827"
                  className="h-16 w-16"
                />
              ) : (
                <div className="h-16 w-16 rounded-lg bg-zinc-100 dark:bg-zinc-800" />
              )}
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Survey QR code</p>
              <p className="mt-0.5 text-xs leading-5 text-zinc-500 dark:text-zinc-400">Share the kiosk link with a clean QR download.</p>

              {showInlineActions && (
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <button type="button" className={utilityActionClass} onClick={open} disabled={!absoluteUrl}>
                    View QR
                  </button>
                  <button type="button" className={utilityActionClass} onClick={handleDownload} disabled={!absoluteUrl}>
                    Download PNG
                  </button>
                  <button type="button" className={utilityActionClass} onClick={handleCopyLink} disabled={!absoluteUrl}>
                    {copied ? 'Copied' : 'Copy Link'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute -left-[9999px] top-0 opacity-0">
        {absoluteUrl ? (
          <QRCodeCanvas
            value={absoluteUrl}
            size={1024}
            level="H"
            marginSize={4}
            bgColor="#FFFFFF"
            fgColor="#111827"
            ref={canvasRef}
          />
        ) : null}
      </div>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Survey QR Code">
        <div className="space-y-5">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{surveyName}</h3>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Use this QR code to open the survey kiosk.</p>
          </div>

          <div className="mx-auto w-fit rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800">
            {absoluteUrl ? (
              <QRCodeSVG
                value={absoluteUrl}
                size={280}
                level="H"
                marginSize={4}
                bgColor="#FFFFFF"
                fgColor="#111827"
                className="h-auto w-[280px] max-w-full"
              />
            ) : null}
          </div>

          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Public kiosk URL</p>
            <p className="break-all text-sm text-zinc-700 dark:text-zinc-200">{absoluteUrl}</p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="secondary" className="flex-1" onClick={handleDownload} disabled={!absoluteUrl}>
              Download PNG
            </Button>
            <Button type="button" className="flex-1" onClick={handleCopyLink} disabled={!absoluteUrl}>
              {copied ? 'Copied' : 'Copy Link'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
