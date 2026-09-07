'use client'

import { useState } from 'react'
import { AdminLayout } from '@/components/admin/AdminLayout'
import { Button } from '@/components/ui/Button'
import { InfoTooltip } from '@/components/ui/InfoTooltip'

const LOCATION_TEAM_TOOLTIP =
  'A Location or Team is where feedback is collected. For example, a store, office, or crew.'

type ProvisionPlan = 'starter' | 'growth'
type ProvisionAccountMode = 'retail' | 'events'

const RETAIL_PLAN_OPTIONS: Array<{
  value: ProvisionPlan
  label: string
  detail: string
}> = [
  {
    value: 'starter',
    label: 'Starter',
    detail: 'Best for one Location/Team',
  },
  {
    value: 'growth',
    label: 'Growth',
    detail: 'Supports up to 5 Locations/Teams',
  },
]

const EVENTS_PLAN_OPTIONS: Array<{
  value: ProvisionPlan
  label: string
  detail: string
}> = [
  {
    value: 'starter',
    label: 'Event Launch',
    detail: 'One launch-ready event voice survey workspace.',
  },
  {
    value: 'growth',
    label: 'Event Scale',
    detail: 'Expanded workspace for multiple event teams, targets, or activations.',
  },
]

export default function ProvisionPage() {
  const [accountMode, setAccountMode] = useState<ProvisionAccountMode>('retail')
  const planOptions = accountMode === 'events' ? EVENTS_PLAN_OPTIONS : RETAIL_PLAN_OPTIONS
  const [formData, setFormData] = useState({
    email: '',
    businessName: '',
    locationName: '',
    plan: 'starter' as ProvisionPlan,
  })
  const [loading, setLoading] = useState(false)
  const [creatingLink, setCreatingLink] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)
  const [signupLink, setSignupLink] = useState<string | null>(null)

  const resetForm = () => {
    setFormData({
      email: '',
      businessName: '',
      locationName: '',
      plan: 'starter',
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setResult(null)

    try {
      const endpoint =
        accountMode === 'events'
          ? '/api/admin/provision-events'
          : '/api/admin/provision-retail'

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email.trim(),
          businessName: formData.businessName.trim(),
          locationName: formData.locationName.trim(),
          plan: formData.plan,
        }),
      })

      const data = await response.json()
      setResult({
        success: data.success,
        message: data.message || (data.success ? 'Provision successful!' : 'Provision failed'),
      })

      if (data.success) {
        resetForm()
      }
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to provision',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleCreateTestSignupLink = async () => {
    setCreatingLink(true)
    setResult(null)
    try {
      const response = await fetch('/api/admin/provision-test-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const data = await response.json()
      if (!response.ok || !data.success || !data.url) {
        throw new Error(data.message || data.error || 'Failed to create test signup link')
      }

      setSignupLink(data.url)
      try {
        await navigator.clipboard.writeText(data.url)
        setResult({ success: true, message: 'Test signup link created and copied to clipboard.' })
      } catch {
        setResult({ success: true, message: 'Test signup link created.' })
      }
    } catch (error) {
      setResult({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to create test signup link',
      })
    } finally {
      setCreatingLink(false)
    }
  }

  return (
    <AdminLayout>
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Provision Account
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
            Create a new customer workspace using the same basic setup fields as signup.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
              Account Mode *
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                {
                  value: 'retail' as const,
                  label: 'Retail',
                  detail: 'Creates the existing customer feedback kiosk setup.',
                },
                {
                  value: 'events' as const,
                  label: 'Events',
                  detail: 'Creates an Events account with a starter voice survey link.',
                },
              ].map((option) => {
                const selected = accountMode === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setAccountMode(option.value)}
                    className={`rounded-xl border px-4 py-4 text-left transition-colors ${
                      selected
                        ? 'border-blue-500 bg-blue-50 shadow-sm dark:border-blue-400 dark:bg-blue-950/30'
                        : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600'
                    }`}
                    aria-pressed={selected}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          {option.label}
                        </div>
                        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                          {option.detail}
                        </p>
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

          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Email *
            </label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-zinc-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              placeholder="owner@acmecoffee.com"
            />
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              This becomes the account email and owner login email.
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
              className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-zinc-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
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
              className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-zinc-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              placeholder="Downtown storefront, campus team, field crew, etc."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
              Plan *
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              {planOptions.map((option) => {
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
                        <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          {option.label}
                        </div>
                        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                          {option.detail}
                        </p>
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

          {result && (
            <div className={`rounded-lg border p-4 ${
              result.success
                ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-200'
                : 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200'
            }`}>
              <p className="text-sm font-medium">{result.message}</p>
            </div>
          )}

          <div className="flex gap-3">
            <Button type="submit" disabled={loading} className="flex-1">
              {loading
                ? 'Provisioning...'
                : accountMode === 'events'
                  ? 'Provision Events Account'
                  : 'Provision Account'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={creatingLink}
              onClick={handleCreateTestSignupLink}
            >
              {creatingLink ? 'Creating Link...' : 'Create Test Signup Link'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                resetForm()
                setResult(null)
              }}
            >
              Clear
            </Button>
          </div>

          {signupLink && (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/60">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Latest test signup link</p>
              <p className="mt-2 break-all font-mono text-xs text-zinc-600 dark:text-zinc-300">{signupLink}</p>
            </div>
          )}
        </form>
      </div>
    </AdminLayout>
  )
}
