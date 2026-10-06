import {
  AppError,
  isAppError,
  notFoundError,
  serviceUnavailableError,
  unauthorizedError,
} from '@shared/errors'
import {MemberListOfTeamDef} from '@shared/endpoints/MemberDef'
import {SeasonListDef} from '@shared/endpoints/SeasonDef'
import {UserListDef} from '@shared/endpoints/UserDef'
import {toast} from '@ui'
import {act, renderHook, waitFor} from '@testing-library/react'
import {ReactNode} from 'react'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {makeAuth, makeSeason, makeTeam} from '../../test/fixtures'
import {makeAuthContext} from '../../test/render'
import {mockServer, serverAppError} from '../../test/server'
import {TAuth, AuthContext, TAuthContext} from '../auth/AuthContext'
import {AUTH_STORAGE_KEY, SEASON_STORAGE_KEY} from '../auth/authStorage'
import {storage} from '../storage'
import {createEndpoint} from './createEndpoint'
import {useEndpoint} from './useEndpoint'

const $SeasonList = createEndpoint(SeasonListDef)
const $UserList = createEndpoint(UserListDef)
const $MemberListOfTeam = createEndpoint(MemberListOfTeamDef)

const renderEndpoint = <E extends Parameters<typeof useEndpoint>[0]>(
  endpoint: E,
  auth?: TAuth,
) => {
  const context: TAuthContext = makeAuthContext(auth)
  const wrapper = ({children}: {children: ReactNode}) => (
    <AuthContext.Provider value={context}>{children}</AuthContext.Provider>
  )
  return {context, ...renderHook(() => useEndpoint(endpoint), {wrapper})}
}

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

const toastError = vi.fn((_title: ReactNode) => '')

beforeEach(() => {
  toastError.mockClear()
  vi.spyOn(toast, 'error').mockImplementation(toastError)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useEndpoint access checks', () => {
  it('asks signed out visitors to sign in without calling the server', async () => {
    const server = mockServer()
    const {result} = renderEndpoint($UserList)
    const error = await rejection(result.current.fetch({}))
    expect(error.statusCode).toBe(401)
    expect(error.errorCode).toBe('auth.sign_in_required')
    expect(server.calls).toHaveLength(0)
    expect(toastError).toHaveBeenCalledWith(error.userMessage)
  })

  it('blocks non admins from admin endpoints', async () => {
    const server = mockServer()
    const {result} = renderEndpoint($UserList, makeAuth())
    const error = await rejection(result.current.fetch({}))
    expect(error.statusCode).toBe(403)
    expect(error.errorCode).toBe('auth.admin_required')
    expect(server.calls).toHaveLength(0)
  })

  it('blocks players without a team from team endpoints', async () => {
    mockServer()
    const {result} = renderEndpoint($MemberListOfTeam, makeAuth())
    const error = await rejection(result.current.fetch('team'))
    expect(error.errorCode).toBe('auth.team_required')
  })

  it('lets team members and admins through with their token', async () => {
    const server = mockServer({'/MemberListOfTeam': () => ({members: []})})
    const member = makeAuth({team: makeTeam()})
    const {result} = renderEndpoint($MemberListOfTeam, member)
    await expect(result.current.fetch('team')).resolves.toEqual({members: []})
    expect(server.calls[0].token).toBe(member.token)

    const admin = makeAuth({user: {admin: true}})
    const adminHook = renderEndpoint($MemberListOfTeam, admin)
    await adminHook.result.current.fetch('team')
    expect(server.calls[1].token).toBe(admin.token)
  })
})

describe('useEndpoint errors', () => {
  it('invalidates the session when the server rejects the token', async () => {
    mockServer({
      '/SeasonList': () => {
        throw serverAppError(unauthorizedError('Session expired.'))
      },
    })
    const {result, context} = renderEndpoint($SeasonList, makeAuth())
    await rejection(result.current.fetch({}))
    expect(context.invalidate).toHaveBeenCalledTimes(1)
  })

  it('keeps the session when a wrong password is entered', async () => {
    mockServer({
      '/SeasonList': () => {
        throw serverAppError(
          unauthorizedError('Wrong password.', {
            errorCode: 'auth.invalid_login',
          }),
        )
      },
    })
    const {result, context} = renderEndpoint($SeasonList, makeAuth())
    const error = await rejection(result.current.fetch({}))
    expect(error.errorCode).toBe('auth.invalid_login')
    expect(context.invalidate).not.toHaveBeenCalled()
  })

  it('does not invalidate signed out visitors on 401', async () => {
    mockServer({
      '/SeasonList': () => {
        throw serverAppError(unauthorizedError('No.'))
      },
    })
    const {result, context} = renderEndpoint($SeasonList)
    await rejection(result.current.fetch({}))
    expect(context.invalidate).not.toHaveBeenCalled()
  })

  it('shows the server user message in a toast and rethrows', async () => {
    mockServer({
      '/SeasonList': () => {
        throw serverAppError(
          serviceUnavailableError('Mail down.', {
            userMessage: 'Email is temporarily unavailable.',
          }),
        )
      },
    })
    const {result} = renderEndpoint($SeasonList)
    const error = await rejection(result.current.fetch({}))
    expect(error.statusCode).toBe(503)
    expect(toastError).toHaveBeenCalledWith('Email is temporarily unavailable.')
  })

  it('clears stale stored auth and reloads home when a stored record is gone', async () => {
    const replace = vi.fn()
    vi.stubGlobal('location', {...window.location, replace})
    storage.set(AUTH_STORAGE_KEY, makeAuth())
    storage.set(SEASON_STORAGE_KEY, makeSeason())
    mockServer({
      '/SeasonList': () => {
        throw serverAppError(
          notFoundError('Season missing.', {errorCode: 'db.record_not_found'}),
        )
      },
    })
    const {result} = renderEndpoint($SeasonList)
    await rejection(result.current.fetch({}))
    expect(storage.has(AUTH_STORAGE_KEY)).toBe(false)
    expect(storage.has(SEASON_STORAGE_KEY)).toBe(false)
    expect(replace).toHaveBeenCalledWith('/')
  })

  it('does not reload when a record is missing but nothing was stored', async () => {
    const replace = vi.fn()
    vi.stubGlobal('location', {...window.location, replace})
    mockServer({
      '/SeasonList': () => {
        throw serverAppError(
          notFoundError('Gone.', {errorCode: 'db.record_not_found'}),
        )
      },
    })
    const {result} = renderEndpoint($SeasonList)
    await rejection(result.current.fetch({}))
    expect(replace).not.toHaveBeenCalled()
  })
})

describe('useEndpoint loading', () => {
  it('is loading while a request is in flight', async () => {
    let resolve: (value: unknown[]) => void = () => undefined
    mockServer({
      '/SeasonList': () => new Promise<unknown[]>((r) => (resolve = r)),
    })
    const {result} = renderEndpoint($SeasonList)
    expect(result.current.loading).toBe(false)
    let request: Promise<unknown> = Promise.resolve()
    act(() => {
      request = result.current.fetch({})
    })
    await waitFor(() => expect(result.current.loading).toBe(true))
    await act(async () => {
      resolve([])
      await request
    })
    expect(result.current.loading).toBe(false)
  })

  it('stops loading after a failure', async () => {
    mockServer({
      '/SeasonList': () => {
        throw serverAppError(unauthorizedError('No.'))
      },
    })
    const {result} = renderEndpoint($SeasonList)
    await act(async () => {
      await result.current.fetch({}).catch(() => undefined)
    })
    expect(result.current.loading).toBe(false)
  })
})
