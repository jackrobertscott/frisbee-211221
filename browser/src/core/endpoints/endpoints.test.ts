import {authPoint} from '@shared/auth/authAccess'
import {PortImportDef} from '@shared/endpoints/PortDef'
import {SeasonListDef} from '@shared/endpoints/SeasonDef'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {mockServer} from '../../test/server'
import {createEndpoint, TEndpoint} from './createEndpoint'
import * as Feature from './Feature'
import * as Fixture from './Fixture'
import * as Member from './Member'
import * as Port from './Port'
import * as Report from './Report'
import * as Season from './Season'
import * as Security from './Security'
import * as Team from './Team'
import * as User from './User'

type TAnyEndpoint = TEndpoint<undefined, undefined, boolean>

const isEndpoint = (value: unknown): value is TAnyEndpoint =>
  typeof value === 'object' &&
  value !== null &&
  'fetch' in value &&
  typeof value.fetch === 'function'

const modules: Record<string, Record<string, unknown>> = {
  Feature,
  Fixture,
  Member,
  Port,
  Report,
  Season,
  Security,
  Team,
  User,
}

const endpoints = Object.entries(modules).flatMap(([module, exports]) =>
  Object.entries(exports).map(([name, endpoint]) => {
    if (!isEndpoint(endpoint))
      throw new Error(`${module}.${name} is not an endpoint`)
    return {module, name, endpoint}
  }),
)

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('browser endpoints', () => {
  it('are exported as $<Path> from each module', () => {
    for (const {module, name} of endpoints)
      expect(name.startsWith(`$${module}`)).toBe(true)
  })

  it.each(endpoints)(
    '$name posts to its shared path',
    async ({name, endpoint}) => {
      const path = `/${name.slice(1)}`
      const server = mockServer({[path]: () => ({ok: true})})
      await expect(endpoint.fetch(undefined, 'tok')).resolves.toEqual({
        ok: true,
      })
      expect(server.calls).toEqual([
        expect.objectContaining({path, token: 'tok'}),
      ])
    },
  )
})

describe('createEndpoint', () => {
  it('keeps the access point for client side checks', () => {
    expect(createEndpoint(PortImportDef).access).toBe(authPoint.portManage)
    expect(createEndpoint(SeasonListDef).access).toBeUndefined()
  })

  it('sends multipart endpoints as form data', async () => {
    const server = mockServer({'/PortImport': () => ({rows: 1})})
    const form = new FormData()
    form.append('kind', 'members')
    await createEndpoint(PortImportDef).fetch(form, 'tok')
    expect(server.calls[0].payload).toBe(form)
  })

  it('wraps JSON payloads in the request envelope', async () => {
    const server = mockServer({'/SeasonList': () => []})
    await createEndpoint(SeasonListDef).fetch({search: 'sum'})
    expect(server.payloads('/SeasonList')).toEqual([{search: 'sum'}])
  })
})
