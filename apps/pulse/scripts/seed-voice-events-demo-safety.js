/**
 * @typedef {object} SeedSafetyInput
 * @property {NodeJS.ProcessEnv} env
 * @property {string} accountSlug
 * @property {string | null} eventId
 * @property {string} eventName
 * @property {boolean} hasExplicitName
 * @property {boolean} hasExplicitSeedKey
 * @property {string} host
 */

/** @param {NodeJS.ProcessEnv} env */
export function isProductionEnvironment(env) {
  return env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production' || env.APP_ENV === 'production'
}

/** @param {SeedSafetyInput} input */
export function assertSeedSafety(input) {
  const isProduction = isProductionEnvironment(input.env)
  const isLocal = input.host === 'localhost' || input.host === '127.0.0.1'

  if (isProduction) {
    if (input.accountSlug !== 'signalthread') {
      throw new Error('Refusing production seed: --account=signalthread is required')
    }
    if (!input.hasExplicitSeedKey) {
      throw new Error('Refusing production seed: an explicit --seed-key=<deterministic key> is required')
    }
    if (!input.hasExplicitName) {
      throw new Error('Refusing production seed: an explicit --name=<event name> is required')
    }
    if (!/\b(?:demo|test)\b/i.test(input.eventName)) {
      throw new Error('Refusing production seed: the explicit event name must clearly contain "demo" or "test"')
    }
    if (input.eventId) {
      throw new Error('Refusing production seed: --event-id is not allowed; use the explicit deterministic --seed-key')
    }
    if (input.env.VOICE_EVENTS_DEMO_ALLOW_PROD !== 'signalthread') {
      throw new Error('Refusing production seed without VOICE_EVENTS_DEMO_ALLOW_PROD=signalthread')
    }
  } else if (input.accountSlug !== 'events-demo') {
    throw new Error('Refusing non-production seed for an account other than events-demo')
  }

  if (!isProduction && !isLocal && input.env.VOICE_EVENTS_DEMO_ALLOW_REMOTE_DEV !== 'true') {
    throw new Error('Refusing to apply to a remote database without VOICE_EVENTS_DEMO_ALLOW_REMOTE_DEV=true')
  }

  return { environment: isProduction ? /** @type {const} */ ('production') : /** @type {const} */ ('development'), isLocal }
}
