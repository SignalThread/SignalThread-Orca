export type AccountProductMode = 'events' | 'retail'

export class AccountProductModeError extends Error {
  constructor(
    message: string,
    public status = 403,
  ) {
    super(message)
    this.name = 'AccountProductModeError'
  }
}

export function getAccountProductMode(accountType: unknown): AccountProductMode {
  return typeof accountType === 'string' && accountType.trim().toUpperCase() === 'EVENTS'
    ? 'events'
    : 'retail'
}

export function isEventsAccount(accountType: unknown) {
  return getAccountProductMode(accountType) === 'events'
}

export function isRetailAccount(accountType: unknown) {
  return getAccountProductMode(accountType) === 'retail'
}

export function requireEventsAccountType(
  accountType: unknown,
  message = 'This feature is only available for EVENTS accounts',
) {
  if (!isEventsAccount(accountType)) {
    throw new AccountProductModeError(message)
  }
}
