import {badRequestError, internalError, notFoundError} from '@shared/errors'
import http, {IncomingMessage} from 'http'
import {RequestHandler, serve} from 'micro'
import {AddressInfo, Socket} from 'net'
import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest'
import config from '../config'
import capture from './capture'

let server: http.Server
let baseUrl = ''
let handler: RequestHandler = () => ({})

beforeAll(async () => {
  server = http.createServer(serve(capture.handle((req, res) => handler(req, res))))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

const isProduction = config.IS_PRODUCTION

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  config.IS_PRODUCTION = isProduction
  vi.restoreAllMocks()
})

const get = async (path = '/thing?x=1') => {
  const response = await fetch(`${baseUrl}${path}`)
  const text = await response.text()
  return {response, text}
}

const errorLines = () => vi.mocked(console.error).mock.calls.map((call) => String(call[0]))

describe('capture.handle', () => {
  it('passes through object and array results', async () => {
    handler = () => ({ok: true})
    expect(JSON.parse((await get()).text)).toEqual({ok: true})
    handler = () => [1, 2]
    expect(JSON.parse((await get()).text)).toEqual([1, 2])
    expect(console.error).not.toHaveBeenCalled()
  })

  it('rejects handler results that are not objects', async () => {
    handler = () => 'text'
    const {response, text} = await get()
    expect(response.status).toBe(500)
    expect(JSON.parse(text)).toMatchObject({
      errorCode: 'request.invalid_handler_response',
      url: '/thing?x=1',
    })
    expect(errorLines()[0]).toBe(
      '[error] | 500 | Internal Server Error | GET | /thing?x=1 | Request handler may only return an object or an array but got string.',
    )
  })

  it('returns serialised errors with debug details outside production', async () => {
    handler = () => {
      throw badRequestError('Bad   thing\n happened', {
        errorCode: 'thing.bad',
        details: {field: 'x'},
      })
    }
    const {response, text} = await get('/bad')
    expect(response.status).toBe(400)
    expect(JSON.parse(text)).toMatchObject({
      errorCode: 'thing.bad',
      message: 'Bad   thing\n happened',
      details: {field: 'x'},
      url: '/bad',
    })
    expect(errorLines()[0]).toBe('[error] | 400 | Bad Request | GET | /bad | Bad thing happened')
  })

  it('does not log not found errors', async () => {
    handler = () => {
      throw notFoundError('Missing.', {errorCode: 'thing.missing'})
    }
    const {response} = await get()
    expect(response.status).toBe(404)
    expect(console.error).not.toHaveBeenCalled()
  })

  it('redacts internal messages and details in production', async () => {
    config.IS_PRODUCTION = true
    handler = () => {
      throw internalError('database password is hunter2', {details: {secret: true}})
    }
    const {response, text} = await get()
    expect(response.status).toBe(500)
    expect(text).not.toContain('hunter2')
    expect(text).not.toContain('secret')
    expect(console.error).toHaveBeenCalledTimes(1)
  })

  it('answers errors that carry a tarpit plan through the tarpit', async () => {
    handler = () => {
      throw badRequestError('Suspicious.', {
        tarpit: {body: 'Go away.', dripIntervalMs: 1000, holdMs: 5, statusCode: 418},
      })
    }
    const {response, text} = await get('/wp-admin')
    expect(response.status).toBe(418)
    expect(text).toBe(' Go away.')
    expect(errorLines()[0]).toBe('[error] | 400 | Bad Request | GET | /wp-admin | Suspicious.')
  })

  it('does not log tarpitted not found errors', async () => {
    handler = () => {
      throw notFoundError('Probe.', {
        tarpit: {body: 'No.', dripIntervalMs: 1000, holdMs: 5, statusCode: 404},
      })
    }
    const {response, text} = await get()
    expect(response.status).toBe(404)
    expect(text).toBe(' No.')
    expect(console.error).not.toHaveBeenCalled()
  })

  it('ignores an incomplete tarpit plan', async () => {
    handler = () => {
      throw badRequestError('Half plan.', {tarpit: {body: 'x', holdMs: 5}})
    }
    const {response, text} = await get()
    expect(response.status).toBe(400)
    expect(JSON.parse(text)).toMatchObject({message: 'Half plan.'})
  })
})

describe('capture.formatLogLine', () => {
  it('falls back to placeholders without a request', () => {
    expect(
      capture.formatLogLine({statusCode: 500, status: '', message: '  '}),
    ).toBe('[error] | 500 | Unknown | UNKNOWN | /')
  })

  it('uses the request method and url when the error has no url', () => {
    const req = new IncomingMessage(new Socket())
    req.method = 'POST'
    req.url = '/from-request'
    expect(
      capture.formatLogLine({statusCode: 409, status: 'Conflict', message: 'Taken'}, req),
    ).toBe('[error] | 409 | Conflict | POST | /from-request | Taken')
  })
})
