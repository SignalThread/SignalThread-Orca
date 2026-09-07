import { vi } from 'vitest'
import type { TestAccount, TestRole, TestUser } from '@/tests/helpers/fixtures'

export function mockSupabaseSession(user: Partial<TestUser> = {}) {
  const sessionUser = {
    id: user.id ?? 'user_test',
    email: user.email ?? 'owner@example.com',
    app_metadata: {},
    user_metadata: {},
  }
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: sessionUser },
        error: null,
      }),
    },
  }
}

export function mockUnauthenticatedSupabaseSession() {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: null },
        error: { message: 'Unauthorized' },
      }),
    },
  }
}

export function mockAuthenticatedUser(account: Pick<TestAccount, 'id' | 'email'>, role: TestRole = 'ADMIN'): TestUser {
  return {
    id: 'user_test',
    email: account.email,
    accountId: account.id,
    role,
    isActive: true,
  }
}

export function loginAsRole(role: TestRole, account: Pick<TestAccount, 'id' | 'email'>): TestUser {
  return mockAuthenticatedUser(account, role)
}
