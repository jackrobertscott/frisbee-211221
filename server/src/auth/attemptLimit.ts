import {tooManyRequestsError} from '@shared/errors'
import {Document} from 'mongodb'
import {$AuthAttemptLimit} from '../tables/$AuthAttemptLimit'

const WINDOW_MS = 15 * 60 * 1000
const BLOCK_MS = 15 * 60 * 1000
const STATE_RETENTION_MS = WINDOW_MS + BLOCK_MS

type TAttemptKind = 'login' | 'verify' | 'delivery'
type TAttemptScope = 'account' | 'client'

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

/**
 * Count one attempt in a single atomic write so concurrent requests cannot
 * lose increments: reset an expired window, add the attempt unless already
 * blocked, then start a block once the scope's limit is reached.
 */
const createAttemptPipeline = (
  state: ReturnType<typeof getStates>[number],
  maxAttempts: number,
  now: number,
): Document[] => {
  const nowIso = new Date(now).toISOString()
  return [
    {
      $set: {
        id: state.id,
        kind: state.kind,
        scope: state.scope,
        email: state.email,
        ...(state.ip ? {ip: state.ip} : {}),
        createdOn: {$ifNull: ['$createdOn', nowIso]},
        updatedOn: nowIso,
        lastSeenAt: now,
        attempts: {$ifNull: ['$attempts', 0]},
        blockedUntil: {$ifNull: ['$blockedUntil', 0]},
        windowStartedAt: {$ifNull: ['$windowStartedAt', now]},
      },
    },
    {
      $set: {
        windowExpired: {
          $and: [
            {$lte: ['$blockedUntil', now]},
            {$gte: [{$subtract: [now, '$windowStartedAt']}, WINDOW_MS]},
          ],
        },
      },
    },
    {
      $set: {
        attempts: {$cond: ['$windowExpired', 0, '$attempts']},
        windowStartedAt: {$cond: ['$windowExpired', now, '$windowStartedAt']},
      },
    },
    {
      $set: {
        attempts: {
          $cond: [
            {$gt: ['$blockedUntil', now]},
            '$attempts',
            {$add: ['$attempts', 1]},
          ],
        },
      },
    },
    {
      $set: {
        attempts: {$cond: [{$gte: ['$attempts', maxAttempts]}, 0, '$attempts']},
        blockedUntil: {
          $cond: [
            {$gte: ['$attempts', maxAttempts]},
            now + BLOCK_MS,
            '$blockedUntil',
          ],
        },
      },
    },
    {$unset: 'windowExpired'},
  ]
}

/** Records an attempt and reports whether any scope was already blocked. */
const recordAttempt = async (
  kind: TAttemptKind,
  email: string,
  ip: string,
) => {
  const now = Date.now()
  const config = LIMITS[kind]
  let blocked = false
  for (const state of getStates(kind, email, ip)) {
    const before = await $AuthAttemptLimit.updateAtomic(
      {id: state.id},
      createAttemptPipeline(state, config.maxAttemptsByScope[state.scope], now),
      {upsert: true, returnDocument: 'before'},
    )
    if (before && before.blockedUntil > now) blocked = true
  }
  return blocked
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

const throwLimited = (kind: TAttemptKind): never => {
  const config = LIMITS[kind]
  throw tooManyRequestsError(config.message, {
    errorCode: config.errorCode,
  })
}

export default {
  /**
   * Counts an attempt before the work it guards and throws when the sender is
   * already rate limited. Counting first means a parallel burst cannot slip
   * extra guesses past the limit; call reset() after a successful attempt.
   */
  async consume(kind: TAttemptKind, email: string, ip: string) {
    await pruneMaybe(Date.now())
    if (await recordAttempt(kind, email, ip)) throwLimited(kind)
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
