import {authPoint} from '@shared/auth/authAccess'
import {
  isAppError,
  serviceUnavailableError,
  unauthorizedError,
} from '@shared/errors'
import {TSeason} from '@shared/schemas/ioSeason'
import {act, render, waitFor} from '@testing-library/react'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {
  makeAuth,
  makeSeason,
  makeSession,
  makeTeam,
  makeUser,
} from '../../test/fixtures'
import {mockServer, serverAppError, THandler} from '../../test/server'
import {storage} from '../storage'
import {TAuth, TAuthContext} from './AuthContext'
import {AuthProvider} from './AuthProvider'
import {AUTH_STORAGE_KEY, SEASON_STORAGE_KEY} from './authStorage'
import {useAuth} from './useAuth'

/** Renders the provider and exposes the latest context value. */
const renderProvider = () => {
  const ref: {current?: TAuthContext} = {}
  const Probe = () => {
    ref.current = useAuth()
    return null
  }
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  )
  const auth = () => {
    if (!ref.current) throw new Error('Auth context not rendered.')
    return ref.current
  }
  return {auth}
}

const renderLoaded = async () => {
  const view = renderProvider()
  await waitFor(() => expect(view.auth().loaded).toBe(true))
  return view
}

const toPayload = (auth: TAuth) => ({
  session: auth.session,
  user: auth.user,
  team: auth.team,
})

const thrown = (callback: () => void) => {
  try {
    callback()
  } catch (error) {
    if (isAppError(error)) return error
    throw error
  }
  throw new Error('Expected callback to throw.')
}

const serve = (current: THandler) =>
  mockServer({'/SecurityCurrent': current, '/SecurityLogout': () => undefined})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AuthProvider start up', () => {
  it('loads the current season for signed out visitors', async () => {
    const season = makeSeason({name: 'Winter'})
    const server = serve(() => ({season}))
    const {auth} = await renderLoaded()
    expect(auth().season).toEqual(season)
    expect(auth().current).toBeUndefined()
    expect(server.calls).toEqual([
      {path: '/SecurityCurrent', payload: {}, token: ''},
    ])
    expect(storage.get(SEASON_STORAGE_KEY)).toEqual(season)
  })

  it('refreshes stored auth using the stored season and token', async () => {
    const season = makeSeason()
    const stored = makeAuth()
    storage.set(SEASON_STORAGE_KEY, season)
    storage.set(AUTH_STORAGE_KEY, stored)
    const fresh = makeAuth({team: makeTeam({seasonId: season.id})})
    const server = serve(() => ({season, auth: toPayload(fresh)}))
    const {auth} = await renderLoaded()
    expect(server.calls[0]).toEqual({
      path: '/SecurityCurrent',
      payload: {seasonId: season.id},
      token: stored.token,
    })
    await waitFor(() => expect(auth().current?.token).toBe(fresh.token))
    expect(auth().current).toEqual(fresh)
    expect(storage.get<TAuth>(AUTH_STORAGE_KEY)?.token).toBe(fresh.token)
  })

  it('signs out when the server no longer recognises the token', async () => {
    storage.set(AUTH_STORAGE_KEY, makeAuth())
    serve(() => ({season: makeSeason()}))
    const {auth} = await renderLoaded()
    expect(auth().current).toBeUndefined()
    expect(storage.has(AUTH_STORAGE_KEY)).toBe(false)
  })

  it('drops an expired session without sending its token', async () => {
    const expired = {
      ...makeAuth(),
      session: makeSession({expiresOn: '2000-01-01T00:00:00.000Z'}),
    }
    storage.set(AUTH_STORAGE_KEY, expired)
    const server = serve(() => ({season: makeSeason()}))
    const {auth} = await renderLoaded()
    expect(server.calls[0].token).toBe('')
    expect(auth().current).toBeUndefined()
    expect(storage.has(AUTH_STORAGE_KEY)).toBe(false)
  })

  it('signs out when the token is rejected with 401', async () => {
    storage.set(AUTH_STORAGE_KEY, makeAuth())
    serve(() => {
      throw serverAppError(unauthorizedError('Session ended.'))
    })
    const {auth} = await renderLoaded()
    expect(auth().current).toBeUndefined()
    expect(storage.has(AUTH_STORAGE_KEY)).toBe(false)
  })

  it('keeps the stored session when the server is unavailable', async () => {
    const stored = makeAuth()
    const season = makeSeason()
    storage.set(AUTH_STORAGE_KEY, stored)
    storage.set(SEASON_STORAGE_KEY, season)
    serve(() => {
      throw serverAppError(serviceUnavailableError('Down.'))
    })
    const {auth} = await renderLoaded()
    expect(auth().current).toEqual(stored)
    expect(auth().season).toEqual(season)
  })
})

describe('AuthProvider actions', () => {
  it('login stores the digested auth payload', async () => {
    serve(() => ({season: makeSeason()}))
    const {auth} = await renderLoaded()
    const next = makeAuth()
    act(() => auth().login(toPayload(next)))
    expect(auth().current).toEqual(next)
    expect(auth().can(authPoint.teamJoin)).toBe(true)
    expect(auth().can(authPoint.reportWrite)).toBe(false)
    expect(auth().isAdmin()).toBe(false)
    await waitFor(() =>
      expect(storage.get<TAuth>(AUTH_STORAGE_KEY)?.userId).toBe(next.userId),
    )
  })

  it('userSet replaces the current user only', async () => {
    const stored = makeAuth()
    storage.set(AUTH_STORAGE_KEY, stored)
    serve(() => ({season: makeSeason(), auth: toPayload(stored)}))
    const {auth} = await renderLoaded()
    act(() => auth().userSet({...stored.user, firstName: 'Renamed'}))
    expect(auth().current?.user.firstName).toBe('Renamed')
    const error = thrown(() => auth().userSet(makeUser()))
    expect(error.errorCode).toBe('auth.user_mismatch')
  })

  it('userSet and teamSet require a signed in user', async () => {
    serve(() => ({season: makeSeason()}))
    const {auth} = await renderLoaded()
    expect(thrown(() => auth().userSet(makeUser())).errorCode).toBe(
      'auth.user_set_without_current',
    )
    expect(thrown(() => auth().teamSet(makeTeam())).errorCode).toBe(
      'auth.team_set_without_current',
    )
  })

  it('teamSet only accepts teams from the current season', async () => {
    const season = makeSeason()
    const stored = makeAuth()
    storage.set(AUTH_STORAGE_KEY, stored)
    serve(() => ({season, auth: toPayload(stored)}))
    const {auth} = await renderLoaded()
    const other = makeTeam({seasonId: makeSeason().id})
    expect(thrown(() => auth().teamSet(other)).errorCode).toBe(
      'auth.team_season_mismatch',
    )
    const team = makeTeam({seasonId: season.id})
    act(() => auth().teamSet(team))
    expect(auth().current?.team).toEqual(team)
    expect(auth().can(authPoint.reportWrite)).toBe(true)
    act(() => auth().teamSet(undefined))
    expect(auth().current?.team).toBeUndefined()
  })

  it('logout clears auth, ends the server session and goes home', async () => {
    const stored = makeAuth()
    storage.set(AUTH_STORAGE_KEY, stored)
    const location = {...window.location, href: 'http://client.test/teams'}
    vi.stubGlobal('location', location)
    const server = serve(() => ({
      season: makeSeason(),
      auth: toPayload(stored),
    }))
    const {auth} = await renderLoaded()
    act(() => auth().logout())
    expect(auth().current).toBeUndefined()
    expect(location.href).toBe('/')
    await waitFor(() =>
      expect(server.calls.at(-1)).toEqual({
        path: '/SecurityLogout',
        payload: undefined,
        token: stored.token,
      }),
    )
    await waitFor(() => expect(storage.has(AUTH_STORAGE_KEY)).toBe(false))
  })

  it('seasonSet stores the season and reloads unless told not to', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', {...window.location, reload})
    serve(() => ({season: makeSeason()}))
    const {auth} = await renderLoaded()
    const quiet: TSeason = makeSeason({name: 'Quiet'})
    act(() => auth().seasonSet(quiet, true))
    expect(auth().season).toEqual(quiet)
    await new Promise((r) => setTimeout(r))
    expect(reload).not.toHaveBeenCalled()

    const loud = makeSeason({name: 'Loud'})
    act(() => auth().seasonSet(loud))
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
    expect(storage.get(SEASON_STORAGE_KEY)).toEqual(loud)
  })
})
