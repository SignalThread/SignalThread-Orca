import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const successClientSource = fs.readFileSync(
  path.join(process.cwd(), 'app/signup/success/SignupSuccessClient.tsx'),
  'utf8',
)
const successPageSource = fs.readFileSync(
  path.join(process.cwd(), 'app/signup/success/page.tsx'),
  'utf8',
)

describe('production signup success OTP onboarding UI', () => {
  it('renders the Voice-owned OTP confirmation flow', () => {
    expect(successClientSource).toContain('Check your email')
    expect(successClientSource).toContain('We&apos;ve sent a 6-digit verification code to your email address.')
    expect(successClientSource).toContain('EmailOtpCodeForm')
    expect(successClientSource).toContain('completeEmailOtpSignIn')
    expect(successClientSource).toContain('Verify and continue')
  })

  it('resolves checkout context server-side and avoids magic-link copy', () => {
    expect(successPageSource).toContain('getCheckoutSuccessContext')
    expect(successPageSource).toContain('session_id')
    expect(successClientSource).not.toContain('magic link')
    expect(successClientSource).not.toContain('sign-in link')
    expect(successClientSource).not.toContain('personal access link')
    expect(successClientSource).not.toContain('Go to login')
  })
})
