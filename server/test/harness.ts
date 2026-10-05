import {AddressInfo} from 'net'
import http from 'http'
import {serve as microServe} from 'micro'
import {afterAll, beforeAll, vi} from 'vitest'
import {createRequestHandler} from '../src/http/requestHandler'
import mongo from '../src/utils/mongo'

export const CLIENT_ORIGIN = 'http://localhost:3000'

export type TResponse<T = unknown> = {status: number; body: T}

export type TTestServer = {
  url: string
  /** POSTs `{payload}` to an endpoint the way the browser does. */
  call<T = any>(
    path: string,
    payload?: unknown,
    options?: {token?: string; origin?: string | null},
  ): Promise<TResponse<T>>
}

/**
 * Starts the real request pipeline on an ephemeral port for the current test
 * file and drops the file's database afterwards.
 */
export function useTestServer(): TTestServer {
  let server: http.Server | undefined
  const state = {url: ''}

  beforeAll(async () => {
    server = http.createServer(microServe(createRequestHandler()))
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
    state.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server?.close(() => resolve()))
    const db = await mongo.database()
    await db.dropDatabase()
    await (await mongo.client()).close()
  })

  return {
    get url() {
      return state.url
    },
    async call(path, payload, options = {}) {
      const origin = options.origin === undefined ? CLIENT_ORIGIN : options.origin
      const response = await fetch(`${state.url}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(origin ? {Origin: origin} : {}),
          ...(options.token ? {Authorization: options.token} : {}),
        },
        body: JSON.stringify({payload}),
      })
      const text = await response.text()
      const type = response.headers.get('content-type') ?? ''
      return {
        status: response.status,
        body: type.includes('application/json') && text ? JSON.parse(text) : text,
      }
    },
  }
}

/** Security codes are logged instead of emailed outside production; read the latest one. */
export function captureSecurityCodes() {
  const codes: Array<{subject: string; email: string; code: string}> = []
  const original = console.log
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    const line = String(args[0] ?? '')
    const match = line.match(/^\[security-code\] (.+) (\S+@\S+) (\S+) \(/)
    if (match) {
      codes.push({subject: match[1], email: match[2], code: match[3]})
      return
    }
    original(...args)
  })
  return {
    latest(email: string) {
      const found = codes.filter((c) => c.email === email).at(-1)
      if (!found) throw new Error(`No security code was sent to ${email}.`)
      return found.code
    },
  }
}
