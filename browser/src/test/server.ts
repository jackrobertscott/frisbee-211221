import {AppError, serializeError} from '@shared/errors'
import {vi} from 'vitest'

export type THandler = (payload: unknown, token: string) => unknown

export interface TCall {
  path: string
  payload: unknown
  token: string
}

/**
 * Replaces global fetch with an in-memory server keyed by endpoint path
 * (e.g. `/SeasonList`). Handlers return the JSON body; throwing an object
 * with `status` responds with that status and the object as the body.
 * Unhandled paths fail with a 404 so missing mocks are obvious.
 */
export const mockServer = (handlers: Record<string, THandler> = {}) => {
  const calls: TCall[] = []
  const routes = {...handlers}
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const path = url.pathname
    const headers = new Headers(init?.headers)
    const token = headers.get('Authorization') ?? ''
    const payload =
      typeof init?.body === 'string'
        ? (JSON.parse(init.body) as {payload?: unknown}).payload
        : init?.body
    calls.push({path, payload, token})
    const handler = routes[path]
    if (!handler)
      return jsonResponse(404, {
        message: `No mock for ${path}`,
        errorCode: 'test.no_mock',
      })
    try {
      const body = await handler(payload, token)
      if (body === undefined) return new Response(null, {status: 204})
      return jsonResponse(200, body)
    } catch (error) {
      if (isStatusError(error)) return jsonResponse(error.status, error)
      throw error
    }
  })
  vi.stubGlobal('fetch', fetchMock)
  return {
    calls,
    fetch: fetchMock,
    /** Adds or replaces a handler. */
    on(path: string, handler: THandler) {
      routes[path] = handler
    },
    /** Payloads sent to a path, in order. */
    payloads(path: string) {
      return calls.filter((call) => call.path === path).map((c) => c.payload)
    },
  }
}

/** Error body thrown from a handler to produce a non-2xx response. */
export const serverError = (
  status: number,
  message: string,
  errorCode = 'test.error',
) => ({status, statusCode: status, message, errorCode})

/**
 * Error body exactly as the server serialises an AppError, so the client
 * keeps its message, errorCode, userMessage and retryable flag. (Bodies from
 * `serverError` are not recognised as serialised app errors, so the client
 * falls back to a generic message and the status code's default errorCode.)
 */
export const serverAppError = (error: AppError) => ({
  ...serializeError(error),
  status: error.statusCode,
})

const isStatusError = (value: unknown): value is {status: number} =>
  typeof value === 'object' &&
  value !== null &&
  'status' in value &&
  typeof value.status === 'number'

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {'Content-Type': 'application/json'},
  })
