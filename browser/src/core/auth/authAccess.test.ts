import {authPoint} from '@shared/auth/authAccess'
import {describe, expect, it} from 'vitest'
import {makeAuth, makeTeam} from '../../test/fixtures'
import {canAccess, readAuthState} from './authAccess'
import {
  AUTH_STORAGE_KEY,
  clearStoredAppState,
  SEASON_STORAGE_KEY,
} from './authStorage'
import {storage} from '../storage'

describe('readAuthState', () => {
  it('treats a missing auth as signed out', () => {
    expect(readAuthState()).toEqual({
      signedIn: false,
      admin: false,
      team: false,
    })
  })

  it('reads admin and team membership from the current auth', () => {
    expect(readAuthState(makeAuth())).toEqual({
      signedIn: true,
      admin: false,
      team: false,
    })
    expect(
      readAuthState(makeAuth({user: {admin: true}, team: makeTeam()})),
    ).toEqual({signedIn: true, admin: true, team: true})
  })
})

describe('canAccess', () => {
  it('applies the shared access rules to the current auth', () => {
    const player = makeAuth()
    const captain = makeAuth({team: makeTeam()})
    const admin = makeAuth({user: {admin: true}})
    expect(canAccess(undefined, authPoint.teamJoin)).toBe(false)
    expect(canAccess(player, authPoint.teamJoin)).toBe(true)
    expect(canAccess(player, authPoint.reportWrite)).toBe(false)
    expect(canAccess(captain, authPoint.reportWrite)).toBe(true)
    expect(canAccess(captain, authPoint.reportManage)).toBe(false)
    expect(canAccess(admin, authPoint.reportManage)).toBe(true)
    // admins act for any team
    expect(canAccess(admin, authPoint.memberManage)).toBe(true)
  })
})

describe('clearStoredAppState', () => {
  it('reports false when there was nothing to clear', () => {
    storage.set('other', 1)
    expect(clearStoredAppState()).toBe(false)
    expect(storage.has('other')).toBe(true)
  })

  it('removes stored auth and season and reports true', () => {
    storage.set(AUTH_STORAGE_KEY, {token: 't'})
    storage.set(SEASON_STORAGE_KEY, {id: 's'})
    expect(clearStoredAppState()).toBe(true)
    expect(storage.has(AUTH_STORAGE_KEY)).toBe(false)
    expect(storage.has(SEASON_STORAGE_KEY)).toBe(false)
  })

  it('clears when only one of the keys is stored', () => {
    storage.set(SEASON_STORAGE_KEY, {id: 's'})
    expect(clearStoredAppState()).toBe(true)
    expect(storage.has(SEASON_STORAGE_KEY)).toBe(false)
  })
})
