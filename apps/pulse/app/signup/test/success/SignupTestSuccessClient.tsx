'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSearchParams } from 'next/navigation'
import { EmailOtpCodeForm } from '@/components/auth/EmailOtpCodeForm'
import { completeEmailOtpSignIn } from '@/lib/auth/complete-email-otp'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

export function SignupTestSuccessClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const email = useMemo(() => searchParams.get('email')?.trim() || '', [searchParams])
  const token = useMemo(() => searchParams.get('token')?.trim() || '', [searchParams])
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [resending, setResending] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (cooldown <= 0) return

    const timeout = window.setTimeout(() => setCooldown((value) => value - 1), 1000)
    return () => window.clearTimeout(timeout)
  }, [cooldown])

  const handleVerify = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setVerifying(true)
    setMessage(null)

    try {
      const result = await completeEmailOtpSignIn(email, code)
      if (!result.success) {
        setMessage({ type: 'error', text: result.error })
        return
      }

      router.push(result.redirectUrl)
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Could not verify your code',
      })
    } finally {
      setVerifying(false)
    }
  }

  const handleResend = async () => {
    setResending(true)
    setMessage(null)
    try {
      const response = await fetch('/api/signup/test/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.message || data.error || 'Could not resend email')
      }
      setCooldown(30)
      setMessage({ type: 'success', text: 'A new verification code is on its way.' })
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Could not resend email',
      })
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-100 dark:bg-zinc-950 px-4">
      <Card className="w-full max-w-md">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">Check your email</h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            We&apos;ve sent a 6-digit verification code to your email address.
          </p>

          {email && (
            <p className="mt-4 text-sm font-medium text-zinc-900 dark:text-zinc-100">
              Sent to {email}
            </p>
          )}

          {message && (
            <div
              className={`mt-5 rounded-lg border p-3 text-sm ${
                message.type === 'success'
                  ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-200'
                  : 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200'
              }`}
            >
              {message.text}
            </div>
          )}

          <div className="mt-6">
            <EmailOtpCodeForm
              email={email}
              code={code}
              loading={verifying}
              onCodeChange={setCode}
              onSubmit={handleVerify}
              submitLabel="Verify and continue"
              title="Enter your verification code"
              description="Open your email, copy the code, and paste it here."
              helperText={`We sent a 6-digit code to ${email}.`}
            />
          </div>

          <div className="mt-5 space-y-3">
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={handleResend}
              disabled={resending || !token || !email || cooldown > 0}
            >
              {resending ? 'Resending…' : cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            </Button>

            <Link
              href="/login"
              className="inline-flex justify-center text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              Go to login
            </Link>
          </div>
        </div>
      </Card>
    </div>
  )
}
