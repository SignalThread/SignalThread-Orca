'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { EmailOtpCodeForm } from '@/components/auth/EmailOtpCodeForm'
import { completeEmailOtpSignIn } from '@/lib/auth/complete-email-otp'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

interface SignupSuccessClientProps {
  email: string | null
  accountName?: string | null
  errorMessage?: string | null
}

export function SignupSuccessClient({ email, accountName, errorMessage }: SignupSuccessClientProps) {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    errorMessage ? { type: 'error', text: errorMessage } : null,
  )

  const handleVerify = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!email) return

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

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-100 dark:bg-zinc-950 px-4">
      <Card className="w-full max-w-md">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">Check your email</h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            We&apos;ve sent a 6-digit verification code to your email address.
          </p>

          {accountName ? (
            <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
              Workspace: <span className="font-medium text-zinc-900 dark:text-zinc-100">{accountName}</span>
            </p>
          ) : null}

          {email ? (
            <p className="mt-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">Sent to {email}</p>
          ) : null}

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

          {email ? (
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
          ) : (
            <div className="mt-6 space-y-3">
              <Button type="button" className="w-full" onClick={() => router.push('/login')}>
                Continue to login
              </Button>
              <Link
                href="/"
                className="inline-flex justify-center text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                Back to SignalThread
              </Link>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
