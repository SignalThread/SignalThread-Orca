import { Suspense } from 'react'
import { Card } from '@/components/ui/Card'
import { SignupTestClient } from './SignupTestClient'

function SignupTestFallback() {
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
          <div className="text-center py-6">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4" />
            <p className="text-zinc-600 dark:text-zinc-400">Loading…</p>
          </div>
        </Card>
      </div>
    </div>
  )
}

export default function TestSignupPage() {
  return (
    <Suspense fallback={<SignupTestFallback />}>
      <SignupTestClient />
    </Suspense>
  )
}
