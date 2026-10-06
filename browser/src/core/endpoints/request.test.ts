import {AppError, isAppError, unauthorizedError} from '@shared/errors'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {config} from '../../config'
import {mockServer, serverAppError} from '../../test/server'
import {request} from './request'

/** Awaits a promise that must reject and returns its AppError. */
const rejection = async (promise: Promise<unknown>): Promise<AppError> => {
  const error: unknown = await promise.then(
    () => {
      throw new Error('Expected the request to fail.')
    },
    (reason: unknown) => reason,
  )
  if (!isAppError(error)) throw error
  return error
}

const stubFetch = (response: Response | Promise<Response>) => {
  const fetchMock = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) => response,
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('request.send', () => {
  const urlServer = config.urlServer

  afterEach(() => {
    config.urlServer = urlServer
    vi.unstubAllGlobals()
  })

  it('posts the payload as JSON with the auth token', async () => {
    vi.useFakeTimers({now: new Date('2026-03-01T00:00:00Z'), toFake: ['Date']})
    const fetchMock = stubFetch(
      new Response(JSON.stringify({ok: 1}), {
        headers: {'Content-Type': 'application/json; charset=utf-8'},
      }),
    )
    await expect(request.send('/Thing', {a: 1}, 'tok')).resolves.toEqual({
      ok: 1,
    })
    vi.useRealTimers()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init = {}] = fetchMock.mock.calls[0]
    expect(url).toBe('http://server.test/Thing')
    expect(init.method).toBe('POST')
    expect(new Headers(init.headers).get('Authorization')).toBe('tok')
    expect(new Headers(init.headers).get('Content-Type')).toBe(
      'application/json',
    )
    expect(JSON.parse(String(init.body))).toEqual({
      payload: {a: 1},
      created: new Date('2026-03-01T00:00:00Z').valueOf(),
    })
  })

  it('sends an empty Authorization header when signed out', async () => {
    const server = mockServer({'/Thing': () => ({})})
    await request.send('/Thing')
    expect(server.calls[0].token).toBe('')
  })

  it('fails fast when the server url is not configured', async () => {
    config.urlServer = ''
    const fetchMock = stubFetch(new Response(null, {status: 204}))
    const error = await rejection(request.send('/Thing'))
    expect(error.errorCode).toBe('client.server_url_missing')
    expect(error.statusCode).toBe(503)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('turns network failures into a retryable service error', async () => {
    const cause = new TypeError('Failed to fetch')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw cause
      }),
    )
    const error = await rejection(request.send('/Thing'))
    expect(error.statusCode).toBe(503)
    expect(error.errorCode).toBe('request.failed')
    expect(error.retryable).toBe(true)
    expect(error.cause).toBe(cause)
    expect(error.userMessage).toMatch(/check your connection/)
  })

  it('rebuilds serialised server errors with their status and code', async () => {
    mockServer({
      '/Thing': () => {
        throw serverAppError(
          unauthorizedError('Session expired.', {
            errorCode: 'auth.session_expired',
            userMessage: 'Please sign in again.',
          }),
        )
      },
    })
    const error = await rejection(request.send('/Thing'))
    expect(error.statusCode).toBe(401)
    expect(error.errorCode).toBe('auth.session_expired')
    expect(error.message).toBe('Session expired.')
    expect(error.userMessage).toBe('Please sign in again.')
  })

  it('keeps only the status of JSON errors that are not serialised app errors', async () => {
    stubFetch(
      new Response(
        JSON.stringify({message: 'Title taken.', errorCode: 'fixture.title_taken'}),
        {status: 400, headers: {'Content-Type': 'application/json'}},
      ),
    )
    const error = await rejection(request.send('/Thing'))
    expect(error.statusCode).toBe(400)
    expect(error.errorCode).toBe('bad_request')
    expect(error.message).toBe('Server request failed.')
  })

  it('falls back to the response status for JSON errors without details', async () => {
    stubFetch(
      new Response(JSON.stringify({}), {
        status: 409,
        headers: {'Content-Type': 'application/json'},
      }),
    )
    const error = await rejection(request.send('/Thing'))
    expect(error.statusCode).toBe(409)
    expect(error.message).toBe('Server request failed.')
  })
})

describe('request.handleResponse', () => {
  it('returns undefined for 204 responses', async () => {
    await expect(
      request.handleResponse(new Response(null, {status: 204})),
    ).resolves.toBeUndefined()
  })

  it('returns a blob for non-JSON success bodies (downloads)', async () => {
    const result: unknown = await request.handleResponse(
      new Response('a,b\n1,2', {headers: {'Content-Type': 'text/csv'}}),
    )
    expect(result).toBeInstanceOf(Blob)
    if (!(result instanceof Blob)) return
    expect(await result.text()).toBe('a,b\n1,2')
  })

  it('uses a plain text error body as the message', async () => {
    const error = await rejection(
      request.handleResponse(
        new Response('  Bad gateway from proxy \n', {
          status: 502,
          headers: {'Content-Type': 'text/plain'},
        }),
      ),
    )
    expect(error.message).toBe('Bad gateway from proxy')
    expect(error.statusCode).toBe(502)
    expect(error.errorCode).toBe('request.failed')
  })

  it('marks empty 5xx errors retryable and 4xx errors not', async () => {
    const server = await rejection(
      request.handleResponse(new Response('', {status: 500})),
    )
    expect(server.message).toBe('Server request failed.')
    expect(server.statusCode).toBe(500)
    expect(server.retryable).toBe(true)
    const client = await rejection(
      request.handleResponse(new Response('', {status: 404})),
    )
    expect(client.statusCode).toBe(404)
    expect(client.retryable).toBe(false)
  })
})

describe('request.multipart', () => {
  const urlServer = config.urlServer

  afterEach(() => {
    config.urlServer = urlServer
    vi.unstubAllGlobals()
  })

  it('posts form data as-is without a JSON content type', async () => {
    const fetchMock = stubFetch(
      new Response(JSON.stringify({imported: 2}), {
        headers: {'Content-Type': 'application/json'},
      }),
    )
    const form = new FormData()
    form.append('file', new Blob(['x']), 'x.csv')
    await expect(request.multipart('/Upload', form, 'tok')).resolves.toEqual({
      imported: 2,
    })
    const [url, init = {}] = fetchMock.mock.calls[0]
    expect(url).toBe('http://server.test/Upload')
    expect(init.body).toBe(form)
    const headers = new Headers(init.headers)
    expect(headers.get('Authorization')).toBe('tok')
    expect(headers.has('Content-Type')).toBe(false)
  })

  it('fails fast when the server url is not configured', async () => {
    config.urlServer = ''
    const error = await rejection(request.multipart('/Upload'))
    expect(error.errorCode).toBe('client.server_url_missing')
  })

  it('turns network failures into a retryable service error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('offline')
      }),
    )
    const error = await rejection(request.multipart('/Upload'))
    expect(error.errorCode).toBe('request.failed')
    expect(error.retryable).toBe(true)
  })
})
