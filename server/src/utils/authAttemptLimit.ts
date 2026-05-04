import {tooManyRequestsError} from '@shared/errors'

const WINDOW_MS = 15 * 60 * 1000
const BLOCK_MS = 15 * 60 * 1000
const PRUNE_INTERVAL = 256
const STATE_RETENTION_MS = WINDOW_MS + BLOCK_MS

type TAttemptKind = 'login' | 'verify'
type TAttemptScope = 'account' | 'client'

interface IAttemptState {
  attempts: number
  windowStartedAt: number
  blockedUntil: number
  lastSeenAt: number
}

const LIMITS: Record<
  TAttemptKind,
  {
    message: string
    errorCode: string
    maxAttemptsByScope: Record<TAttemptScope, number>
  }
> = {
  login: {
    message: 'Too many failed login attempts. Please try again in 15 minutes.',
    errorCode: 'auth.login_rate_limited',
    maxAttemptsByScope: {
      account: 10,
      client: 5,
    },
  },
  verify: {
    message:
      'Too many failed security code attempts. Please try again in 15 minutes.',
    errorCode: 'user.code_rate_limited',
    maxAttemptsByScope: {
      account: 10,
      client: 5,
    },
  },
}

const stateByKey = new Map<string, IAttemptState>()

let readCount = 0

const normalize = (value: string) => value.trim().toLowerCase()

const prune = (now: number) => {
  for (const [key, state] of stateByKey.entries()) {
    const idleMs = now - state.lastSeenAt
    if (state.blockedUntil <= now && idleMs > STATE_RETENTION_MS) {
      stateByKey.delete(key)
    }
  }
}

const getState = (key: string, now: number) => {
  readCount += 1
  if (readCount % PRUNE_INTERVAL === 0) prune(now)

  const current = stateByKey.get(key)
  if (!current) {
    const fresh: IAttemptState = {
      attempts: 0,
      windowStartedAt: now,
      blockedUntil: 0,
      lastSeenAt: now,
    }
    stateByKey.set(key, fresh)
    return fresh
  }

  if (current.blockedUntil <= now && now - current.windowStartedAt >= WINDOW_MS) {
    current.attempts = 0
    current.windowStartedAt = now
  }

  current.lastSeenAt = now
  return current
}

const getKeys = (kind: TAttemptKind, email: string, ip: string) => {
  const normalizedEmail = normalize(email)
  const normalizedIp = normalize(ip || 'unknown')
  return [
    {
      scope: 'account' as const,
      key: `${kind}:account:${normalizedEmail}`,
    },
    {
      scope: 'client' as const,
      key: `${kind}:client:${normalizedIp}:${normalizedEmail}`,
    },
  ]
}

export default {
  assertAllowed(kind: TAttemptKind, email: string, ip: string) {
    const now = Date.now()
    const config = LIMITS[kind]

    for (const {key} of getKeys(kind, email, ip)) {
      const state = getState(key, now)
      if (state.blockedUntil > now) {
        throw tooManyRequestsError(config.message, {
          errorCode: config.errorCode,
        })
      }
    }
  },

  registerFailure(kind: TAttemptKind, email: string, ip: string) {
    const now = Date.now()
    const config = LIMITS[kind]

    for (const {key, scope} of getKeys(kind, email, ip)) {
      const state = getState(key, now)
      if (state.blockedUntil > now) continue

      if (now - state.windowStartedAt >= WINDOW_MS) {
        state.attempts = 0
        state.windowStartedAt = now
      }

      state.attempts += 1
      if (state.attempts >= config.maxAttemptsByScope[scope]) {
        state.attempts = 0
        state.blockedUntil = now + BLOCK_MS
      }
    }
  },

  reset(kind: TAttemptKind, email: string, ip: string) {
    for (const {key} of getKeys(kind, email, ip)) {
      stateByKey.delete(key)
    }
  },
}
