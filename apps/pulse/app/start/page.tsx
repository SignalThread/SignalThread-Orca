'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { InfoTooltip } from '@/components/ui/InfoTooltip'

const LOCATION_TEAM_TOOLTIP =
  'A Location or Team is where feedback is collected. For example, a store, office, or crew.'

export default function StartPage() {
  const [formData, setFormData] = useState({
    businessName: '',
    locationName: '',
    email: '',
    plan: 'starter' as 'starter' | 'growth',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedBusiness = formData.businessName.trim()
    const trimmedLocation = formData.locationName.trim()
    if (!trimmedBusiness) {
      setError('Business name is required')
      return
    }
    if (!trimmedLocation) {
      setError('Location/Team is required')
      return
    }
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email.trim(),
          businessName: formData.businessName.trim(),
          locationName: trimmedLocation,
          plan: formData.plan,
        }),
      })
      let data: { url?: string; message?: string; error?: string } = {}
      try {
        data = await response.json()
      } catch {
        data = {}
      }

      if (!response.ok) {
        setError(data.message || data.error || 'Checkout failed')
        return
      }

      const url = data?.url
      if (url && typeof url === 'string') {
        window.location.href = url
        return
      }
      setError('No checkout URL received')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
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
            Enter your details to continue to secure checkout.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 sm:p-7 shadow-xl">
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Email Address *
            </label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-4 py-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
              placeholder="owner@acmecoffee.com"
            />
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              You&apos;ll log in with your email and a 6-digit code
            </p>
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
              placeholder="Downtown storefront, Main campus team, etc."
            />
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              This helps us personalize your workspace and reporting defaults.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Plan
            </label>
            <select
              value={formData.plan}
              onChange={(e) => setFormData({ ...formData, plan: e.target.value as 'starter' | 'growth' })}
              className="w-full px-4 py-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
            >
              <option value="starter">Starter</option>
              <option value="growth">Growth</option>
            </select>
          </div>

          {error && (
            <div className="p-3 rounded-lg border text-sm bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200">
              {error}
            </div>
          )}

          <Button type="submit" disabled={loading} className="w-full" size="lg">
            {loading ? 'Redirecting to checkout...' : 'Get Started'}
          </Button>

          <p className="text-xs text-center text-zinc-500 dark:text-zinc-400">
            After setup, log in at /login with your email. No password required.
          </p>
        </form>
      </div>
    </div>
  )
}
