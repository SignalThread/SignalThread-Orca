import { randomBytes, createHash } from 'crypto'

export const TEST_SIGNUP_TOKEN_TTL_DAYS = 7

export function generateTestSignupToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashTestSignupToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function getTestSignupTokenExpiry(): Date {
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + TEST_SIGNUP_TOKEN_TTL_DAYS)
  return expiresAt
}

export function isExpired(date: Date, now = new Date()): boolean {
  return date.getTime() <= now.getTime()
}
