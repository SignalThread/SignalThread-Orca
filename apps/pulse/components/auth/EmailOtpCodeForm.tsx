'use client'

import type { ClipboardEvent, FormEvent, ReactNode } from 'react'
import { Button } from '@/components/ui/Button'

interface EmailOtpCodeFormProps {
  email: string
  code: string
  loading: boolean
  onCodeChange: (code: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>
  submitLabel?: string
  label?: string
  helperText?: ReactNode
  title?: string
  description?: ReactNode
  onBack?: () => void
  backLabel?: string
}

export function EmailOtpCodeForm({
  email,
  code,
  loading,
  onCodeChange,
  onSubmit,
  submitLabel = 'Verify code',
  label = 'Enter 6-digit code',
  helperText,
  title,
  description,
  onBack,
  backLabel = 'Back',
}: EmailOtpCodeFormProps) {
  const handleChange = (value: string) => {
    onCodeChange(value.replace(/\D/g, '').slice(0, 6))
  }

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pasted) return

    event.preventDefault()
    onCodeChange(pasted)
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {title && (
        <div className="text-center">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
          {description && <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{description}</p>}
        </div>
      )}

      <div>
        <label htmlFor="otp-code" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
          {label}
        </label>
        <input
          id="otp-code"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          value={code}
          autoFocus
          onChange={(event) => handleChange(event.target.value)}
          onPaste={handlePaste}
          required
          placeholder="000000"
          className="w-full px-4 py-3 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-500 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 text-center text-2xl tracking-[0.5em] font-mono"
        />
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">
          {helperText ?? (
            <>
              We sent a 6-digit code to <span className="font-medium text-zinc-700 dark:text-zinc-300">{email}</span>.
            </>
          )}
        </p>
      </div>

      <div className="flex gap-3">
        {onBack ? (
          <Button type="button" variant="secondary" onClick={onBack} disabled={loading} className="flex-1">
            {backLabel}
          </Button>
        ) : null}
        <Button type="submit" disabled={loading || code.length !== 6} className={onBack ? 'flex-1' : 'w-full'}>
          {loading ? 'Verifying…' : submitLabel}
        </Button>
      </div>
    </form>
  )
}
