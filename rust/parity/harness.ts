/**
 * Sends each scenario request to the TS server and then the Rust server, and
 * records every difference. The scenario is written in terms of TS values
 * (ids and tokens from TS responses); payloads are translated for Rust through
 * the id map learned while comparing responses.
 */
import AdmZip from 'adm-zip'
import * as FeatureDefs from '@shared/endpoints/FeatureDef'
import * as FixtureDefs from '@shared/endpoints/FixtureDef'
import * as MemberDefs from '@shared/endpoints/MemberDef'
import * as PortDefs from '@shared/endpoints/PortDef'
import * as ReportDefs from '@shared/endpoints/ReportDef'
import * as SeasonDefs from '@shared/endpoints/SeasonDef'
import * as SecurityDefs from '@shared/endpoints/SecurityDef'
import * as TeamDefs from '@shared/endpoints/TeamDef'
import * as UserDefs from '@shared/endpoints/UserDef'
import {TEndpointDef} from '@shared/utils/endpointDef'
import {diffValues, IdMap, mapStrings} from './compare'
import {CLIENT_ORIGIN, IServer} from './servers'

export const ENDPOINT_DEFS: Map<string, TEndpointDef> = new Map(
  [
    FeatureDefs,
    FixtureDefs,
    MemberDefs,
    PortDefs,
    ReportDefs,
    SeasonDefs,
    SecurityDefs,
    TeamDefs,
    UserDefs,
  ].flatMap((module) =>
    Object.values(module)
      .filter(
        (value): value is TEndpointDef =>
          typeof value === 'object' &&
          value !== null &&
          'path' in value &&
          typeof value.path === 'string',
      )
      .map((def) => [def.path, def] as const),
  ),
)

/** A value that differs per server (e.g. a security code read from each log). */
export class PerSide<T> {
  constructor(
    readonly ts: T,
    readonly rust: T,
  ) {}
}

export type TSide = 'ts' | 'rust'

export type TResponse = {
  status: number
  headers: Record<string, string>
  /** Parsed JSON, text, or for zips `{files: {name: content}}`. */
  body: unknown
  raw: Buffer
}

export type TActor = {
  name: string
  email: string
  /** TS user id (the Rust one is found through the id map). */
  userId: string
  /** TS session token. */
  token: string
  password?: string
}

export type TCallOptions = {
  as?: TActor | null
  /** Raw Authorization header value (TS space, translated for Rust). */
  authorization?: string
  origin?: string | null
  method?: string
  /** Replaces the `{payload}` JSON body. */
  rawBody?: string | Buffer
  contentType?: string | null
  /** Client address, forwarded through the trusted loopback proxy. */
  ip?: string
  headers?: Record<string, string>
  /** Builds the request body per side (multipart). */
  form?: (side: TSide) => FormData
  /** Rewrites each side's body before the comparison. */
  normalize?: (body: unknown, side: TSide) => unknown
  ignore?: string[]
  /** Skip the comparison of bodies (statuses and headers are still compared). */
  skipBody?: boolean
  /** Expected TS status; a different one aborts the scenario (setup broken). */
  expect?: number
  timeoutMs?: number
}

const COMPARED_HEADERS = [
  'content-type',
  'content-disposition',
  'cache-control',
  'pragma',
  'expires',
  'x-content-type-options',
  'access-control-allow-origin',
  'access-control-allow-credentials',
  'access-control-allow-methods',
  'access-control-allow-headers',
  'access-control-max-age',
  'vary',
]

export type TMismatch = {step: string; path: string; problems: string[]}

export class Harness {
  readonly ids = new IdMap()
  readonly mismatches: TMismatch[] = []
  readonly called = new Set<string>()
  readonly runStartedAt = Date.now()
  steps = 0
  private ipCounter = 0

  constructor(
    readonly ts: IServer,
    readonly rust: IServer,
  ) {}

  /** A fresh client address, so rate limits and intrusion strikes stay apart. */
  nextIp(): string {
    this.ipCounter += 1
    return `198.51.100.${this.ipCounter}`
  }

  code(email: string): PerSide<string> {
    return new PerSide(this.ts.proc.latestCode(email), this.rust.proc.latestCode(email))
  }

  rustId(tsId: string): string {
    const id = this.ids.tsToRust.get(tsId)
    if (!id) throw new Error(`No Rust id paired with ${tsId}`)
    return id
  }

  async promoteAdmin(actor: TActor) {
    await this.ts.promoteAdmin(actor.userId)
    await this.rust.promoteAdmin(this.rustId(actor.userId))
  }

  private resolve(value: unknown, side: TSide): unknown {
    if (value instanceof PerSide) return value[side]
    if (Array.isArray(value)) return value.map((item) => this.resolve(item, side))
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, this.resolve(v, side)]),
      )
    return value
  }

  private async send(
    server: IServer,
    side: TSide,
    path: string,
    payload: unknown,
    options: TCallOptions,
  ): Promise<TResponse> {
    const translate = <T>(value: T): T =>
      side === 'rust' ? this.ids.toRust(value) : value
    const headers: Record<string, string> = {}
    const origin = options.origin === undefined ? CLIENT_ORIGIN : options.origin
    if (origin) headers.Origin = origin
    const authorization = options.authorization ?? options.as?.token
    if (authorization) headers.Authorization = translate(authorization)
    headers['X-Forwarded-For'] = options.ip ?? '203.0.113.10'
    let body: BodyInit | undefined
    if (options.form) {
      body = options.form(side)
    } else if (options.rawBody !== undefined) {
      body =
        typeof options.rawBody === 'string'
          ? options.rawBody
          : new Uint8Array(options.rawBody)
      if (options.contentType !== null)
        headers['Content-Type'] = options.contentType ?? 'application/json'
    } else if ((options.method ?? 'POST') === 'POST') {
      body = JSON.stringify(
        payload === undefined ? {} : {payload: translate(this.resolve(payload, side))},
      )
      if (options.contentType !== null)
        headers['Content-Type'] = options.contentType ?? 'application/json'
    }
    Object.assign(headers, options.headers)
    let response: Response
    try {
      response = await fetch(`${server.url}${path}`, {
        method: options.method ?? 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
      })
    } catch (error) {
      const cause = (error as {cause?: {code?: string; message?: string}}).cause
      const text = `request failed: ${cause?.code ?? cause?.message ?? String(error)}`
      return {status: 0, headers: {}, body: text, raw: Buffer.from(text)}
    }
    const raw = Buffer.from(await response.arrayBuffer())
    const responseHeaders: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value
    })
    const type = responseHeaders['content-type'] ?? ''
    let parsed: unknown = raw.toString()
    if (type.includes('application/json') && raw.length) {
      try {
        parsed = JSON.parse(raw.toString())
      } catch {
        parsed = raw.toString()
      }
    } else if (type.includes('application/zip')) {
      parsed = {files: readZip(raw)}
    }
    return {status: response.status, headers: responseHeaders, body: parsed, raw}
  }

  /**
   * Sends one request to both servers and compares the responses. Returns the
   * TS response (its ids are what later steps use).
   */
  async call(
    step: string,
    path: string,
    payload?: unknown,
    options: TCallOptions = {},
  ): Promise<TResponse & {rust: TResponse}> {
    this.steps += 1
    const def = ENDPOINT_DEFS.get(path)
    if (def) this.called.add(path)
    const ts = await this.send(this.ts, 'ts', path, payload, options)
    const rust = await this.send(this.rust, 'rust', path, payload, options)
    const problems: string[] = []
    if (ts.status !== rust.status)
      problems.push(`status: ts=${ts.status} rust=${rust.status}`)
    for (const header of COMPARED_HEADERS) {
      const a = ts.headers[header]
      const b = rust.headers[header]
      if (a === b) continue
      // export file names carry the export time
      if (
        header === 'content-disposition' &&
        a !== undefined &&
        b !== undefined &&
        sameExportName(a, b)
      )
        continue
      problems.push(`header ${header}: ts=${JSON.stringify(a)} rust=${JSON.stringify(b)}`)
    }
    if (!options.skipBody) {
      const tsBody = options.normalize ? options.normalize(ts.body, 'ts') : tarpitText(ts)
      const rustBody = options.normalize ? options.normalize(rust.body, 'rust') : tarpitText(rust)
      problems.push(
        ...diffValues(tsBody, rustBody, {
          ids: this.ids,
          runStartedAt: this.runStartedAt,
          ignore: [...(options.ignore ?? []), ...errorIgnores(ts.body, rust.body)],
        }),
      )
    }
    // the browser validates successful bodies against the endpoint's result schema
    const isPost = (options.method ?? 'POST') === 'POST'
    if (isPost && def?.result && rust.status === 200 && !(rust.body instanceof Object && 'files' in rust.body)) {
      const result = def.result.validate(rust.body as never)
      if (!result.ok) problems.push(`rust body fails ${path} result schema: ${result.error}`)
    }
    if (isPost && def?.result && ts.status === 200 && !(ts.body instanceof Object && 'files' in ts.body)) {
      const result = def.result.validate(ts.body as never)
      if (!result.ok)
        console.warn(`  (note) ts body fails ${path} result schema: ${result.error}`)
    }
    if (problems.length) {
      this.mismatches.push({step, path, problems})
      console.log(`✗ ${step} ${path}`)
      for (const problem of problems) console.log(`    ${problem}`)
    } else if (process.env.PARITY_VERBOSE) {
      console.log(`✓ ${step} ${path} ${ts.status}`)
      if (process.env.PARITY_VERBOSE === '2') console.log(`    ${ts.raw.toString().slice(0, 300)}`)
    }
    if (options.expect !== undefined && ts.status !== options.expect)
      throw new Error(
        `Scenario setup failed at "${step}" ${path}: expected TS status ${options.expect}, got ${ts.status} ${JSON.stringify(ts.body).slice(0, 500)}`,
      )
    return {...ts, rust}
  }

  /** Sends one request to both servers and compares them, but runs the
   * comparison on the results of `compare` (for generated, random data). */
  record(step: string, path: string, problems: string[]) {
    if (!problems.length) return
    this.mismatches.push({step, path, problems})
    console.log(`✗ ${step} ${path}`)
    for (const problem of problems) console.log(`    ${problem}`)
  }

  /** The Rust value of a TS-space value. */
  forRust<T>(value: T): T {
    return this.ids.toRust(value)
  }

  /**
   * A `normalize` that sorts the arrays at `paths` (dot paths; `*` maps over
   * an array) by each element's `key` field, with Rust ids read as their TS
   * pairs. Used where the TS order is decided by MongoDB index order over
   * random ids (e.g. `$User.getMany({id: {$in}})` comes back sorted by id),
   * which no other server can reproduce: the browser sees the same records,
   * in an arbitrary order on both servers.
   */
  unordered(paths: string[], key = 'id'): (body: unknown, side: TSide) => unknown {
    return (value, side) => {
      const toTs = (id: unknown) =>
        typeof id === 'string' && side === 'rust' ? (this.ids.rustToTs.get(id) ?? id) : id
      const clone = structuredClone(value)
      for (const path of paths) sortAt(clone, path.split('.'), (item) => String(toTs((item as TBodyAny)?.[key])))
      return clone
    }
  }
}

type TBodyAny = Record<string, unknown>

function sortAt(value: unknown, segments: string[], keyOf: (item: unknown) => string) {
  if (value === null || typeof value !== 'object') return
  const [head, ...rest] = segments
  if (head === '*') {
    if (Array.isArray(value)) for (const item of value) sortAt(item, rest, keyOf)
    return
  }
  const record = value as TBodyAny
  if (!rest.length) {
    const list = record[head]
    if (Array.isArray(list)) list.sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0))
    return
  }
  sortAt(record[head], rest, keyOf)
}

/**
 * Development error bodies include `lines`: the JavaScript stack trace on TS,
 * `["AppError: <message>"]` on Rust (documented in rust/README.md). Both must
 * be present; their contents are not compared.
 */
function errorIgnores(ts: unknown, rust: unknown): string[] {
  const isError = (body: unknown): body is Record<string, unknown> =>
    typeof body === 'object' && body !== null && (body as {type?: unknown}).type === 'app_error'
  if (
    isError(ts) &&
    isError(rust) &&
    Array.isArray(ts.lines) &&
    Array.isArray(rust.lines) &&
    rust.lines.every((line) => typeof line === 'string')
  )
    return ['$.lines']
  return []
}

/**
 * Tarpits drip a space every few seconds until their hold time ends; how many
 * land depends on timer jitter (TS itself varies between runs), so only the
 * leading whitespace and the final text are compared.
 */
function tarpitText(response: TResponse): unknown {
  const type = response.headers['content-type'] ?? ''
  if (typeof response.body !== 'string' || !type.startsWith('text/plain')) return response.body
  return {dripped: /^\s/.test(response.body), text: response.body.trim()}
}

const EXPORT_STAMP = /(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/g

function sameExportName(ts: string, rust: string): boolean {
  const stamps = (value: string) =>
    [...value.matchAll(EXPORT_STAMP)].map((m) => Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`))
  const a = stamps(ts)
  const b = stamps(rust)
  return (
    ts.replace(EXPORT_STAMP, '<time>') === rust.replace(EXPORT_STAMP, '<time>') &&
    a.length === b.length &&
    a.every((time, i) => Math.abs(time - b[i]) < 120_000)
  )
}

function readZip(buffer: Buffer): Record<string, unknown> {
  const files: Record<string, unknown> = {}
  try {
    const zip = new AdmZip(buffer)
    for (const entry of zip.getEntries()) {
      const text = entry.getData().toString('utf8')
      files[entry.entryName] = entry.entryName.endsWith('.json')
        ? JSON.parse(text)
        : text.split(/\r?\n/)
    }
  } catch (error) {
    files['<unreadable zip>'] = String(error)
  }
  return files
}

export {mapStrings}
