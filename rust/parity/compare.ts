/**
 * Structural comparison of a TS response with the Rust response to the same
 * request. Generated values cannot match byte for byte, so:
 *
 * - record ids (24 alphanumerics) and session tokens (JWTs) are paired up the
 *   first time they appear in the same position on both sides, and must stay
 *   paired from then on (a later mismatch is a real difference);
 * - ISO timestamps may differ when both are "now" (within a couple of minutes
 *   of each other, after the run started). Dates the scenario supplies are far
 *   from now, so a server echoing the wrong date is still caught.
 *
 * Everything else must be equal, including which keys are present. Key order
 * is ignored.
 */

export const ID_RE = /^[A-Za-z0-9]{24}$/
export const JWT_RE = /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/
export const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

const NOW_TOLERANCE_MS = 2 * 60 * 1000

export class IdMap {
  readonly tsToRust = new Map<string, string>()
  readonly rustToTs = new Map<string, string>()

  /** Pairs two generated values; false when either is already paired elsewhere. */
  pair(ts: string, rust: string): boolean {
    const knownRust = this.tsToRust.get(ts)
    const knownTs = this.rustToTs.get(rust)
    if (knownRust !== undefined || knownTs !== undefined)
      return knownRust === rust && knownTs === ts
    this.tsToRust.set(ts, rust)
    this.rustToTs.set(rust, ts)
    return true
  }

  /** Replaces every paired TS value in a payload with its Rust counterpart. */
  toRust<T>(value: T): T {
    return mapStrings(value, (s) => this.tsToRust.get(s) ?? replaceKnown(s, this.tsToRust)) as T
  }

  /** Rewrites paired Rust values inside a free-text string back to TS values. */
  textToTs(value: string): string {
    return replaceKnown(value, this.rustToTs)
  }
}

const replaceKnown = (value: string, map: Map<string, string>): string => {
  if (value.length < 24) return value
  const tokens = value.replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, (token) => map.get(token) ?? `\u0000${token}\u0000`)
  // ids inside tokens are left alone
  return tokens
    .split('\u0000')
    .map((part, i) => (i % 2 ? part : part.replace(/[A-Za-z0-9]{24}/g, (id) => map.get(id) ?? id)))
    .join('')
}

export const mapStrings = (value: unknown, fn: (s: string) => string): unknown => {
  if (typeof value === 'string') return fn(value)
  if (Array.isArray(value)) return value.map((item) => mapStrings(item, fn))
  if (value && typeof value === 'object' && !(value instanceof Blob)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, mapStrings(item, fn)]),
    )
  }
  return value
}

export type TDiffOptions = {
  ids: IdMap
  runStartedAt: number
  /** Paths (`a.b[0].c`, `*` matches one segment) whose values are not compared. */
  ignore?: string[]
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const describe = (value: unknown) => {
  const text = JSON.stringify(value)
  if (text === undefined) return String(value)
  return text.length > 200 ? `${text.slice(0, 200)}…` : text
}

const matchesPath = (pattern: string, actual: string) => {
  const p = pattern.split('.')
  const a = actual.split('.')
  if (p.length !== a.length) return false
  return p.every((segment, i) => segment === '*' || segment === a[i])
}

/** Collects differences between a TS value and a Rust value. */
export function diffValues(
  ts: unknown,
  rust: unknown,
  options: TDiffOptions,
  at = '$',
  out: string[] = [],
): string[] {
  if (options.ignore?.some((pattern) => matchesPath(pattern, at))) return out
  if (Array.isArray(ts) && Array.isArray(rust)) {
    if (ts.length !== rust.length)
      out.push(`${at}: array length ts=${ts.length} rust=${rust.length}`)
    const length = Math.min(ts.length, rust.length)
    for (let i = 0; i < length; i++)
      diffValues(ts[i], rust[i], options, `${at}.${i}`, out)
    return out
  }
  if (isPlainObject(ts) && isPlainObject(rust)) {
    const keys = new Set([...Object.keys(ts), ...Object.keys(rust)])
    for (const key of keys) {
      const path = `${at}.${key}`
      if (options.ignore?.some((pattern) => matchesPath(pattern, path))) continue
      if (!(key in rust)) {
        out.push(`${path}: missing in rust (ts=${describe(ts[key])})`)
        continue
      }
      if (!(key in ts)) {
        out.push(`${path}: only in rust (rust=${describe(rust[key])})`)
        continue
      }
      diffValues(ts[key], rust[key], options, path, out)
    }
    return out
  }
  if (typeof ts === 'string' && typeof rust === 'string') {
    if (!stringsMatch(ts, rust, options))
      out.push(`${at}: ts=${describe(ts)} rust=${describe(rust)}`)
    return out
  }
  if (typeof ts === 'number' && typeof rust === 'number') {
    if (!Object.is(ts === 0 ? 0 : ts, rust === 0 ? 0 : rust))
      out.push(`${at}: ts=${ts} rust=${rust}`)
    return out
  }
  if (ts !== rust || typeof ts !== typeof rust)
    out.push(`${at}: ts=${describe(ts)} rust=${describe(rust)}`)
  return out
}

function stringsMatch(ts: string, rust: string, options: TDiffOptions): boolean {
  if (ts === rust) return !options.ids.rustToTs.has(rust) || options.ids.rustToTs.get(rust) === ts
  if ((ID_RE.test(ts) && ID_RE.test(rust)) || (JWT_RE.test(ts) && JWT_RE.test(rust)))
    return options.ids.pair(ts, rust)
  if (ISO_RE.test(ts) && ISO_RE.test(rust)) {
    const a = Date.parse(ts)
    const b = Date.parse(rust)
    const floor = options.runStartedAt - 5_000
    return a >= floor && b >= floor && Math.abs(a - b) <= NOW_TOLERANCE_MS
  }
  return options.ids.textToTs(rust) === ts
}
