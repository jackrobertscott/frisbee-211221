import {tooManyRequestsError} from '@shared/errors'
import {TAuthAttemptLimit} from '@shared/schemas/ioAuthAttemptLimit'
import {$AuthAttemptLimit} from '../tables/$AuthAttemptLimit'

const WINDOW_MS = 15 * 60 * 1000
const BLOCK_MS = 15 * 60 * 1000
const STATE_RETENTION_MS = WINDOW_MS + BLOCK_MS

type TAttemptKind = 'login' | 'verify' | 'delivery'
type TAttemptScope = 'account' | 'client'
type TAttemptState = Omit<TAuthAttemptLimit, 'createdOn' | 'updatedOn'>

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
  delivery: {
    message: 'Too many security code requests. Please try again in 15 minutes.',
    errorCode: 'user.code_delivery_rate_limited',
    maxAttemptsByScope: {
      account: 3,
      client: 6,
    },
  },
}

const normalize = (value: string) => value.trim().toLowerCase()

const getStates = (kind: TAttemptKind, email: string, ip: string) => {
  const normalizedEmail = normalize(email)
  const normalizedIp = normalize(ip || 'unknown')
  return [
    {
      id: `${kind}:account:${normalizedEmail}`,
      kind,
      scope: 'account' as const,
      email: normalizedEmail,
    },
    {
      id: `${kind}:client:${normalizedIp}:${normalizedEmail}`,
      kind,
      scope: 'client' as const,
      email: normalizedEmail,
      ip: normalizedIp,
    },
  ]
}

const createInitialState = (
  state: ReturnType<typeof getStates>[number],
  now: number,
): TAttemptState => {
  return {
    id: state.id,
    kind: state.kind,
    scope: state.scope,
    email: state.email,
    ...(state.ip ? {ip: state.ip} : {}),
    attempts: 0,
    windowStartedAt: now,
    blockedUntil: 0,
    lastSeenAt: now,
  }
}

const getCurrentState = (
  current: TAuthAttemptLimit | undefined,
  stateDef: ReturnType<typeof getStates>[number],
  now: number,
): TAttemptState => {
  const state = current ?? createInitialState(stateDef, now)
  if (state.blockedUntil <= now && now - state.windowStartedAt >= WINDOW_MS) {
    return {
      ...state,
      attempts: 0,
      windowStartedAt: now,
      lastSeenAt: now,
    }
  }
  return {
    ...state,
    lastSeenAt: now,
  }
}

const saveState = async (
  current: TAuthAttemptLimit | undefined,
  state: TAttemptState,
) => {
  if (current) {
    await $AuthAttemptLimit.updateOne({id: state.id}, state)
    return
  }
  await $AuthAttemptLimit.createOne(state)
}

const prune = async (now: number) => {
  const cutoff = now - STATE_RETENTION_MS
  await $AuthAttemptLimit.deleteMany({
    blockedUntil: {$lte: now},
    lastSeenAt: {$lt: cutoff},
  })
}

let lastPrunedAt = 0

const pruneMaybe = async (now: number) => {
  if (now - lastPrunedAt < STATE_RETENTION_MS) return
  lastPrunedAt = now
  await prune(now)
}

export default {
  async assertAllowed(kind: TAttemptKind, email: string, ip: string) {
    const now = Date.now()
    await pruneMaybe(now)
    const config = LIMITS[kind]
    const states = getStates(kind, email, ip)
    const current = await $AuthAttemptLimit.getMany({
      id: {$in: states.map((i) => i.id)},
    })

    for (const {id} of states) {
      const state = current.find((i) => i.id === id)
      if (state && state.blockedUntil > now) {
        throw tooManyRequestsError(config.message, {
          errorCode: config.errorCode,
        })
      }
    }
  },

  async registerFailure(
    kind: Extract<TAttemptKind, 'login' | 'verify'>,
    email: string,
    ip: string,
  ) {
    const now = Date.now()
    const config = LIMITS[kind]

    for (const stateDef of getStates(kind, email, ip)) {
      const current = await $AuthAttemptLimit.maybeOne({id: stateDef.id})
      const state = getCurrentState(current, stateDef, now)
      if (state.blockedUntil > now) continue

      state.attempts += 1
      if (state.attempts >= config.maxAttemptsByScope[stateDef.scope]) {
        state.attempts = 0
        state.blockedUntil = now + BLOCK_MS
      }

      await saveState(current, state)
    }
  },

  async consume(
    kind: Extract<TAttemptKind, 'delivery'>,
    email: string,
    ip: string,
  ) {
    const now = Date.now()
    const config = LIMITS[kind]

    for (const stateDef of getStates(kind, email, ip)) {
      const current = await $AuthAttemptLimit.maybeOne({id: stateDef.id})
      const state = getCurrentState(current, stateDef, now)
      if (state.blockedUntil > now) continue

      state.attempts += 1
      if (state.attempts >= config.maxAttemptsByScope[stateDef.scope]) {
        state.attempts = 0
        state.blockedUntil = now + BLOCK_MS
      }

      await saveState(current, state)
    }
  },

  async reset(
    kind: Extract<TAttemptKind, 'login' | 'verify'>,
    email: string,
    ip: string,
  ) {
    await $AuthAttemptLimit.deleteMany({
      id: {$in: getStates(kind, email, ip).map((i) => i.id)},
    })
  },
}
