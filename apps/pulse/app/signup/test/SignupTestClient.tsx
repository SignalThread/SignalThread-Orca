'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { InfoTooltip } from '@/components/ui/InfoTooltip'

const LOCATION_TEAM_TOOLTIP =
  'A Location or Team is where feedback is collected. For example, a store, office, or crew.'

type SignupPlan = 'starter' | 'growth'

const PLAN_OPTIONS: Array<{ value: SignupPlan; label: string; detail: string }> = [
  { value: 'starter', label: 'Starter', detail: 'Best for one Location/Team' },
  { value: 'growth', label: 'Growth', detail: 'Supports up to 5 Locations/Teams' },
]

export function SignupTestClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = useMemo(() => searchParams.get('token')?.trim() || '', [searchParams])

  const [loading, setLoading] = useState(false)
  const [checkingToken, setCheckingToken] = useState(true)
  const [tokenError, setTokenError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    email: '',
    businessName: '',
    locationName: '',
    plan: 'starter' as SignupPlan,
  })

  useEffect(() => {
    const checkToken = async () => {
      if (!token) {
        setTokenError('This signup link is missing a token.')
        setCheckingToken(false)
        return
      }

      try {
        const response = await fetch(`/api/signup/test?token=${encodeURIComponent(token)}`)
        const data = await response.json()
        if (!response.ok || !data.success) {
          setTokenError(data.error || 'This signup link is not valid.')
        }
      } catch (err) {
        setTokenError(err instanceof Error ? err.message : 'This signup link could not be validated.')
      } finally {
        setCheckingToken(false)
      }
    }

    checkToken()
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/signup/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          email: formData.email.trim(),
          businessName: formData.businessName.trim(),
          locationName: formData.locationName.trim(),
          plan: formData.plan,
        }),
      })

      const data = await response.json()
      if (!response.ok || !data.success) {
        setError(data.message || data.error || 'Signup failed')
        return
      }

      router.push(data.redirectUrl || '/login')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-zinc-900 dark:to-zinc-800 flex flex-col p-4">
      <header className="flex justify-start mb-4">
        <img src="/brand/logov2.png" alt="SignalThread" className="h-10" />
      </header>

      <div className="max-w-md w-full mx-auto flex-1 flex flex-col justify-start pt-4">
        <div className="text-center mb-5">
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-1.5">
            Create your account
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Use your test signup link to create a workspace.
          </p>
        </div>

        <Card className="w-full">
          {checkingToken ? (
            <div className="text-center py-6">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4" />
              <p className="text-zinc-600 dark:text-zinc-400">Validating signup link…</p>
            </div>
          ) : tokenError ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
                {tokenError}
              </div>
              <Button type="button" variant="secondary" className="w-full" onClick={() => router.push('/login')}>
                Go to Login
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                  placeholder="owner@acmecoffee.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Business Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.businessName}
                  onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                  className="w-full px-4 py-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                  placeholder="Acme Coffee Co."
                />
              </div>

              <div>
                <label className="mb-1 flex items-center gap-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  <span>Location/Team *</span>
                  <InfoTooltip content={LOCATION_TEAM_TOOLTIP} />
                </label>
                <input
                  type="text"
                  required
                  value={formData.locationName}
                  onChange={(e) => setFormData({ ...formData, locationName: e.target.value })}
                  className="w-full px-4 py-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
                  placeholder="Downtown storefront, field crew, etc."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
                  Plan *
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  {PLAN_OPTIONS.map((option) => {
                    const selected = formData.plan === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setFormData({ ...formData, plan: option.value })}
                        className={`rounded-xl border px-4 py-4 text-left transition-colors ${
                          selected
                            ? 'border-blue-500 bg-blue-50 shadow-sm dark:border-blue-400 dark:bg-blue-950/30'
                            : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600'
                        }`}
                        aria-pressed={selected}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{option.label}</div>
                            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{option.detail}</p>
                          </div>
                          <div
                            className={`mt-0.5 h-4 w-4 rounded-full border ${
                              selected
                                ? 'border-blue-500 bg-blue-500'
                                : 'border-zinc-300 bg-transparent dark:border-zinc-600'
                            }`}
                          />
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
                  {error}
                </div>
              )}

              <Button type="submit" disabled={loading} className="w-full" size="lg">
                {loading ? 'Creating account...' : 'Create Account'}
              </Button>

              <p className="text-xs text-center text-zinc-500 dark:text-zinc-400">
                After setup, continue to login with your email and 6-digit code.
              </p>
            </form>
          )}
        </Card>
      </div>
    </div>
  )
}
