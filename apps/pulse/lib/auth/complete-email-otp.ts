import { createClient } from '@/lib/supabase/client'

type CompleteEmailOtpResult =
  | { success: true; redirectUrl: string }
  | { success: false; error: string }

export async function completeEmailOtpSignIn(email: string, code: string): Promise<CompleteEmailOtpResult> {
  const supabase = createClient()
  const normalizedEmail = email.trim().toLowerCase()
  const normalizedCode = code.replace(/\D/g, '').slice(0, 6)

  const { error } = await supabase.auth.verifyOtp({
    email: normalizedEmail,
    token: normalizedCode,
    type: 'email',
  })

  if (error) {
    console.error('[OTP] verifyOtp error:', error)
    return {
      success: false,
      error: typeof error?.message === 'string' ? error.message : 'Unable to verify code. Please try again.',
    }
  }

  const res = await fetch('/api/auth/link-user', { method: 'POST' })
  const json = await res.json()

  if (!json.success || !json.redirectUrl) {
    const apiError = json.error
    console.error('[OTP] link-user error:', apiError)
    return {
      success: false,
      error: typeof apiError === 'string' ? apiError : 'Unable to sign in. Please try again.',
    }
  }

  return {
    success: true,
    redirectUrl: json.redirectUrl,
  }
}
