import {forbiddenError, notFoundError} from '@shared/errors'
import {IncomingMessage} from 'http'
import {StatusCodes} from 'http-status-codes'
import {ITarpitPlan} from './tarpit'

const STRIKE_RESET_MS = 30 * 60 * 1000
const LOG_COOLDOWN_MS = 30 * 1000
const BLOCK_THRESHOLD = 6
const PRUNE_INTERVAL = 256
const BLOCK_DURATIONS_MS = [15, 60, 360, 1440].map(
  (minutes) => minutes * 60 * 1000,
)
const STATE_RETENTION_MS = STRIKE_RESET_MS + BLOCK_DURATIONS_MS.at(-1)!

const SUSPICIOUS_PATH_PATTERNS = [
  /(^|\/)\.git(?:\/|$)/i,
  /(^|\/)(wp-admin|wp-content|wp-includes|cgi-bin)(?:\/|$)/i,
  /(^|\/)(xmlrpc|xmrlpc)\.php$/i,
  /(^|\/)\.well-known(?:\/|$)/i,
  /\.(?:php\d*|asp|aspx|jsp|cgi)(?:\/|$)/i,
]

interface IIntrusionState {
  score: number
  blockedUntil: number
  blockCount: number
  lastSeenAt: number
  lastLoggedAt: number
}

interface IInspectOptions {
  pathname: string
  knownRoute: boolean
  originAllowed: boolean
  origin?: string
}

const stateByIp = new Map<string, IIntrusionState>()

let inspectCount = 0

const getHeaderValue = (value?: string | string[]) => {
  if (Array.isArray(value)) return value[0]
  return value
}

const isPrivateIpv4 = (value: string) => {
  const parts = value.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part)))
    return false
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
  )
}

const isTrustedProxy = (ip?: string) => {
  if (!ip) return false
  const normalized = ip.replace(/^::ffff:/, '').toLowerCase()
  if (normalized === '::1' || normalized === 'localhost') return true
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true
  return isPrivateIpv4(normalized)
}

const pruneState = (now: number) => {
  for (const [ip, state] of stateByIp.entries()) {
    const expired = state.blockedUntil <= now
    const idleForMs = now - state.lastSeenAt
    if (expired && idleForMs > STATE_RETENTION_MS) {
      stateByIp.delete(ip)
    }
  }
}

const createTarpitPlan = ({
  blocked,
  suspiciousPath,
}: {
  blocked?: boolean
  suspiciousPath?: boolean
}): ITarpitPlan => {
  if (blocked) {
    return {
      body: 'Not found.',
      dripIntervalMs: 4000,
      holdMs: 45000,
      statusCode: StatusCodes.NOT_FOUND,
    }
  }

  if (suspiciousPath) {
    return {
      body: 'Not found.',
      dripIntervalMs: 5000,
      holdMs: 25000,
      statusCode: StatusCodes.NOT_FOUND,
    }
  }

  return {
    body: 'Not found.',
    dripIntervalMs: 6000,
    holdMs: 12000,
    statusCode: StatusCodes.NOT_FOUND,
  }
}

const getState = (ip: string, now: number) => {
  inspectCount += 1
  if (inspectCount % PRUNE_INTERVAL === 0) pruneState(now)

  const existing = stateByIp.get(ip)
  if (!existing) {
    const fresh: IIntrusionState = {
      score: 0,
      blockedUntil: 0,
      blockCount: 0,
      lastSeenAt: now,
      lastLoggedAt: 0,
    }
    stateByIp.set(ip, fresh)
    return fresh
  }

  if (
    existing.blockedUntil <= now &&
    now - existing.lastSeenAt > STRIKE_RESET_MS
  ) {
    existing.score = 0
  }

  existing.lastSeenAt = now
  return existing
}

const logEvent = ({
  ip,
  state,
  message,
  now,
  force,
}: {
  ip: string
  state: IIntrusionState
  message: string
  now: number
  force?: boolean
}) => {
  if (!force && now - state.lastLoggedAt < LOG_COOLDOWN_MS) return
  state.lastLoggedAt = now
  console.warn(`[intrusion] ${ip} ${message}`)
}

const addStrike = ({
  ip,
  state,
  weight,
  reason,
  path,
  now,
}: {
  ip: string
  state: IIntrusionState
  weight: number
  reason: string
  path: string
  now: number
}) => {
  state.score += weight

  if (state.score < BLOCK_THRESHOLD) {
    logEvent({
      ip,
      state,
      now,
      message: `${reason} on "${path}" score=${state.score}`,
    })
    return
  }

  state.score = 0
  state.blockCount += 1
  state.blockedUntil =
    now +
    BLOCK_DURATIONS_MS[
      Math.min(state.blockCount - 1, BLOCK_DURATIONS_MS.length - 1)
    ]

  logEvent({
    ip,
    state,
    now,
    force: true,
    message: `${reason} on "${path}" blocked-until=${new Date(
      state.blockedUntil,
    ).toISOString()}`,
  })
}

export default {
  getClientIp(req: IncomingMessage) {
    const remoteAddress = req.socket.remoteAddress?.trim()
    const forwarded = getHeaderValue(req.headers['x-forwarded-for'])
      ?.split(',')[0]
      ?.trim()
    const rawIp =
      forwarded && isTrustedProxy(remoteAddress)
        ? forwarded
        : remoteAddress || 'unknown'
    return rawIp.replace(/^::ffff:/, '')
  },
  getPathname(url?: string) {
    if (!url) return '/'
    try {
      return new URL(url, 'http://localhost').pathname || '/'
    } catch (error) {
      return url.split('?')[0] || '/'
    }
  },
  inspect(req: IncomingMessage, options: IInspectOptions): Error | null {
    const now = Date.now()
    const ip = this.getClientIp(req)
    const state = getState(ip, now)

    if (state.blockedUntil > now) {
      logEvent({
        ip,
        state,
        now,
        message: `attempted "${options.pathname}" while blocked until ${new Date(
          state.blockedUntil,
        ).toISOString()}`,
      })
      return notFoundError('Not found.', {
        errorCode: 'intrusion.blocked',
        tarpit: createTarpitPlan({blocked: true}),
      })
    }

    const suspiciousPath = SUSPICIOUS_PATH_PATTERNS.some((pattern) =>
      pattern.test(options.pathname),
    )

    if (suspiciousPath || (!options.knownRoute && !options.originAllowed)) {
      let reason = 'suspicious request'
      let weight = 3

      if (suspiciousPath) {
        reason = 'exploit probe'
        weight += 4
      }

      if (!options.knownRoute) {
        reason = suspiciousPath ? reason : 'unknown route probe'
        weight += 2
      }

      if (!options.originAllowed) {
        weight += 1
      }

      addStrike({
        ip,
        state,
        weight,
        reason,
        path: options.pathname,
        now,
      })

      return notFoundError('Not found.', {
        errorCode: suspiciousPath
          ? 'intrusion.exploit_probe'
          : 'intrusion.suspicious_request',
        tarpit: createTarpitPlan({suspiciousPath}),
      })
    }

    if (!options.originAllowed) {
      addStrike({
        ip,
        state,
        weight: 2,
        reason: `forbidden origin "${options.origin}"`,
        path: options.pathname,
        now,
      })

      return forbiddenError(
        `Forbidden origin "${options.origin}" attempted "${options.pathname}"`,
        {
          errorCode: 'intrusion.origin_forbidden',
        },
      )
    }

    return null
  },
}
