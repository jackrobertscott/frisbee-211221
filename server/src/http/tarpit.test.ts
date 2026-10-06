import http, {IncomingHttpHeaders} from 'http'
import {AddressInfo} from 'net'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import tarpit, {ITarpitPlan} from './tarpit'

let server: http.Server
let baseUrl = ''

const plans = new Map<string, ITarpitPlan>()

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const plan = plans.get(req.url ?? '')
    if (!plan) {
      res.end('already ended')
      void tarpit.respond(res, {body: 'x', dripIntervalMs: 10, holdMs: 10, statusCode: 500})
      return
    }
    void tarpit.respond(res, plan)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

type TResult = {status: number; headers: IncomingHttpHeaders; body: string}

/** Starts a request; `done` resolves with the full response, `abort` drops the connection. */
const request = (path: string, plan?: ITarpitPlan) => {
  if (plan) plans.set(path, plan)
  let clientRequest: http.ClientRequest | undefined
  const firstByte = new Promise<void>((resolveFirstByte) => {
    clientRequest = http.get(`${baseUrl}${path}`, {agent: false}, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk: string) => {
        body += chunk
        resolveFirstByte()
      })
      res.on('end', () => {
        resolveDone({status: res.statusCode ?? 0, headers: res.headers, body})
      })
      res.on('error', () => undefined)
    })
    clientRequest.on('error', () => undefined)
  })
  let resolveDone: (value: TResult) => void = () => undefined
  const done = new Promise<TResult>((resolve) => {
    resolveDone = resolve
  })
  return {
    firstByte,
    done,
    abort: () => clientRequest?.destroy(),
  }
}

const plan = (overrides: Partial<ITarpitPlan> = {}): ITarpitPlan => ({
  body: 'Too many requests.',
  dripIntervalMs: 20,
  holdMs: 90,
  statusCode: 429,
  ...overrides,
})

describe('tarpit.respond', () => {
  it('drips spaces until the hold time ends, then sends the body', async () => {
    const startedAt = Date.now()
    const result = await request('/drip', plan()).done
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(80)
    expect(result.status).toBe(429)
    expect(result.headers['content-type']).toBe('text/plain; charset=utf-8')
    expect(result.headers['cache-control']).toBe('no-store, max-age=0')
    expect(result.headers['x-content-type-options']).toBe('nosniff')
    expect(result.headers['transfer-encoding']).toBe('chunked')
    expect(result.body).toMatch(/^ {2,5}Too many requests\.$/)
  })

  it('sends only the body when the hold is shorter than a drip', async () => {
    const result = await request('/short', plan({holdMs: 5, dripIntervalMs: 1000})).done
    expect(result.body).toBe(' Too many requests.')
  })

  it('does nothing for a response that has already ended', async () => {
    const result = await request('/ended').done
    expect(result).toMatchObject({status: 200, body: 'already ended'})
  })

  it('answers immediately once too many tarpits are open, and recovers', async () => {
    const held = Array.from({length: 24}, (_, index) =>
      request(`/held-${index}`, plan({holdMs: 60_000, dripIntervalMs: 25})),
    )
    await Promise.all(held.map((item) => item.firstByte))

    const startedAt = Date.now()
    const overflow = await request('/overflow', plan({holdMs: 60_000, statusCode: 403, body: 'Blocked.'})).done
    expect(Date.now() - startedAt).toBeLessThan(1_000)
    expect(overflow.status).toBe(403)
    expect(overflow.body).toBe('Blocked.')
    expect(overflow.headers['transfer-encoding']).toBeUndefined()
    expect(overflow.headers.connection).toBe('close')

    // closed connections stop their tarpit and free its slot
    for (const item of held) item.abort()
    await new Promise((resolve) => setTimeout(resolve, 150))
    const after = await request('/after', plan({holdMs: 30})).done
    expect(after.body).toMatch(/^ +Too many requests\.$/)
  })
})
