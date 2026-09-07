'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Password reset flow removed (passwordless auth).
 * Redirect to login.
 */
export default function ResetPasswordPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/login')
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-black px-4">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4" />
        <p className="text-zinc-400">Redirecting to login…</p>
      </div>
    </div>
  )
}
