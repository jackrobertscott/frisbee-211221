import {describe, expect, it} from 'vitest'
import {useTestServer} from '../harness'

const server = useTestServer()

describe('request pipeline', () => {
  it('answers the root and health checks', async () => {
    const root = await fetch(`${server.url}/`)
    expect(root.status).toBe(200)
    expect(await root.json()).toMatchObject({env: 'development'})
    const health = await fetch(`${server.url}/health`)
    expect(await health.json()).toMatchObject({ok: true})
  })

  it('answers CORS preflight requests for the client origin', async () => {
    const response = await fetch(`${server.url}/SeasonList`, {
      method: 'OPTIONS',
      headers: {Origin: 'http://localhost:3000'},
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBe(
      'http://localhost:3000',
    )
    expect(response.headers.get('access-control-allow-methods')).toBe(
      'POST,OPTIONS',
    )
  })

  it('rejects non-POST requests to known routes', async () => {
    const response = await fetch(`${server.url}/SeasonList`, {
      headers: {Origin: 'http://localhost:3000'},
    })
    expect(response.status).toBe(405)
    expect(await response.json()).toMatchObject({
      errorCode: 'request.method_not_allowed',
    })
  })

  it('returns 404 for unknown routes from the client origin', async () => {
    const response = await server.call('/NoSuchEndpoint', {})
    expect(response.status).toBe(404)
    expect(response.body).toMatchObject({errorCode: 'request.route_not_found'})
  })

  it('forbids known routes from other origins', async () => {
    const response = await server.call(
      '/SeasonList',
      {},
      {origin: 'https://evil.example.com'},
    )
    expect(response.status).toBe(403)
    expect(response.body).toMatchObject({
      errorCode: 'intrusion.origin_forbidden',
    })
  })

  it('reports invalid payloads as validation errors with a friendly message', async () => {
    const response = await server.call('/SecurityStatus', {email: 'nope'})
    expect(response.status).toBe(422)
    expect(response.body).toMatchObject({
      errorCode: 'validation_error',
      userMessage: 'Please check email address and try again.',
    })
  })

  it('requires the payload wrapper', async () => {
    const response = await fetch(`${server.url}/SecurityStatus`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:3000',
      },
      body: JSON.stringify({}),
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      errorCode: 'request.payload_missing',
    })
  })

  it('reports a missing season before any season exists', async () => {
    const response = await server.call('/SecurityCurrent', {})
    expect(response.status).toBe(404)
    expect(response.body).toMatchObject({errorCode: 'season.not_found'})
  })
})
