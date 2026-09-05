'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { completeEmailOtpSignIn } from '@/lib/auth/complete-email-otp'
import { EmailOtpCodeForm } from '@/components/auth/EmailOtpCodeForm'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

type Step = 'email' | 'code'

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const requestedNext = searchParams.get('next')
  const safeNext = requestedNext?.startsWith('/app/') && !requestedNext.startsWith('//')
    ? requestedNext
    : null

  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Check for existing session
  useEffect(() => {
    const checkSession = async () => {
      const supabase = createClient()
      const { data } = await supabase.auth.getSession()

      if (data.session) {
        const res = await fetch('/api/auth/link-user', { method: 'POST' })
        const json = await res.json()

        if (json.success && json.redirectUrl) {
          router.push(safeNext || json.redirectUrl)
          return
        }
      }

      setCheckingSession(false)
    }

    checkSession()
  }, [router, safeNext])

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      })

      if (error) {
        console.error('[Login] signInWithOtp error:', error)
        const text = typeof error?.message === 'string' ? error.message : 'Unable to sign in. Please try again.'
        setMessage({ type: 'error', text })
        return
      }

      setMessage({ type: 'success', text: 'Check your email for a 6-digit code.' })
      setStep('code')
    } catch (err: unknown) {
      console.error('[Login] signInWithOtp exception:', err)
      const text = err instanceof Error ? err.message : 'Unable to sign in. Please try again.'
      setMessage({ type: 'error', text })
    } finally {
      setLoading(false)
    }
  }

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    try {
      const result = await completeEmailOtpSignIn(email, code)
      if (!result.success) {
        setMessage({ type: 'error', text: result.error })
        return
      }

      router.push(safeNext || result.redirectUrl)
    } catch (err: unknown) {
      console.error('[Login] verifyOtp exception:', err)
      const text = err instanceof Error ? err.message : 'Unable to sign in. Please try again.'
      setMessage({ type: 'error', text })
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    setStep('email')
    setCode('')
    setMessage(null)
  }

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-100 dark:bg-zinc-950 px-4">
        <Card className="w-full max-w-md">
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4" />
            <p className="text-zinc-600 dark:text-zinc-400">Checking authentication…</p>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-100 dark:bg-zinc-950 px-4">
      <Card className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">SignalThread</h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            {step === 'email' ? 'Sign in with your email' : 'Enter your 6-digit code'}
          </p>
        </div>

        {step === 'email' ? (
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="w-full px-4 py-3 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-500 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
              />
            </div>

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Sending…' : 'Send code'}
            </Button>

            <p className="mt-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
              Need help?{' '}
              <a
                href="mailto:support@signalthread.ai"
                className="hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
              >
                support@signalthread.ai
              </a>
            </p>
          </form>
        ) : (
          <EmailOtpCodeForm
            email={email}
            code={code}
            loading={loading}
            onCodeChange={setCode}
            onSubmit={handleCodeSubmit}
            onBack={handleBack}
            submitLabel="Sign in"
            helperText={`Check your email at ${email}`}
          />
        )}

        {message && typeof message.text === 'string' && message.text.trim() !== '' && (
          <div
            className={`mt-4 p-3 rounded-lg border ${
              message.type === 'success'
                ? 'bg-green-50 dark:bg-green-900/50 border-green-200 dark:border-green-600 text-green-800 dark:text-green-100'
                : 'bg-red-50 dark:bg-red-900/50 border-red-200 dark:border-red-600 text-red-800 dark:text-red-100'
            }`}
          >
            <p className="text-sm font-medium">{message.text}</p>
          </div>
        )}
      </Card>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-zinc-100 dark:bg-zinc-950 px-4">
        <Card className="w-full max-w-md">
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4" />
            <p className="text-zinc-600 dark:text-zinc-400">Loading…</p>
          </div>
        </Card>
      </div>
    }>
      <LoginContent />
    </Suspense>
  )
}
