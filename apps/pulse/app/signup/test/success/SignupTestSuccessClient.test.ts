import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const successScreenSource = fs.readFileSync(
  path.join(process.cwd(), 'app/signup/test/success/SignupTestSuccessClient.tsx'),
  'utf8',
)

describe('signup success OTP onboarding UI', () => {
  it('keeps the onboarding confirmation messaging and embeds OTP entry on the same screen', () => {
    expect(successScreenSource).toContain('Check your email')
    expect(successScreenSource).toContain('We&apos;ve sent a 6-digit verification code to your email address.')
    expect(successScreenSource).toContain('Enter your verification code')
    expect(successScreenSource).toContain('Open your email, copy the code, and paste it here.')
    expect(successScreenSource).toContain('Verify and continue')
    expect(successScreenSource).not.toContain('enter it on the login screen')
  })

  it('supports resend cooldown and keeps the login link secondary', () => {
    expect(successScreenSource).toContain('Resend code')
    expect(successScreenSource).toContain('Resend code in ${cooldown}s')
    expect(successScreenSource).toContain('Go to login')
  })
})
