import { Suspense } from 'react'
import { Card } from '@/components/ui/Card'
import { SignupTestSuccessClient } from './SignupTestSuccessClient'

function SignupTestSuccessFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-100 dark:bg-zinc-950 px-4">
      <Card className="w-full max-w-md">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4" />
          <p className="text-zinc-600 dark:text-zinc-400">Loading…</p>
        </div>
      </Card>
    </div>
  )
}

export default function SignupTestSuccessPage() {
  return (
    <Suspense fallback={<SignupTestSuccessFallback />}>
      <SignupTestSuccessClient />
    </Suspense>
  )
}
