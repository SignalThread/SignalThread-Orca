import { Suspense } from 'react'
import { Card } from '@/components/ui/Card'
import { getCheckoutSuccessContext } from '@/lib/billing/checkout-success'
import { SignupSuccessClient } from './SignupSuccessClient'

function SignupSuccessFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-100 dark:bg-zinc-950 px-4">
      <Card className="w-full max-w-md">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4" />
          <p className="text-zinc-600 dark:text-zinc-400">Loading...</p>
        </div>
      </Card>
    </div>
  )
}

async function SignupSuccessContent({
  searchParams,
}: {
  searchParams: { session_id?: string | string[] }
}) {
  const sessionId = Array.isArray(searchParams.session_id) ? searchParams.session_id[0] : searchParams.session_id
  const context = await getCheckoutSuccessContext(sessionId)

  if (!context.ok) {
    return <SignupSuccessClient email={null} errorMessage={context.message} />
  }

  return <SignupSuccessClient email={context.email} accountName={context.accountName} />
}

export default function SignupSuccessPage({
  searchParams,
}: {
  searchParams: { session_id?: string | string[] }
}) {
  return (
    <Suspense fallback={<SignupSuccessFallback />}>
      <SignupSuccessContent searchParams={searchParams} />
    </Suspense>
  )
}
