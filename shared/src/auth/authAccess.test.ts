import {describe, expect, it} from 'vitest'
import {
  authPoint,
  authRuleByPoint,
  canAccessAuthPoint,
  readAuthDeny,
  TAuthPoint,
  TAuthState,
} from './authAccess'

const anonymous: TAuthState = {signedIn: false, team: false, admin: false}
const signedIn: TAuthState = {signedIn: true, team: false, admin: false}
const teamMember: TAuthState = {signedIn: true, team: true, admin: false}
const admin: TAuthState = {signedIn: true, team: false, admin: true}

const points = Object.values(authPoint)

describe('authRuleByPoint', () => {
  it('defines a rule for every auth point', () => {
    expect(Object.keys(authRuleByPoint).sort()).toEqual([...points].sort())
  })
})

describe('readAuthDeny', () => {
  it('denies everything requiring access to anonymous users with sign_in', () => {
    for (const point of points) {
      expect(readAuthDeny(anonymous, point), point).toBe('sign_in')
    }
  })

  it('lets admins through every point', () => {
    for (const point of points) {
      expect(readAuthDeny(admin, point), point).toBeUndefined()
    }
  })

  it('handles signed-in rules', () => {
    expect(readAuthDeny(signedIn, authPoint.userSelf)).toBeUndefined()
    expect(readAuthDeny(signedIn, authPoint.teamJoin)).toBeUndefined()
  })

  it('requires a team for team rules unless admin', () => {
    const teamPoints: TAuthPoint[] = [
      authPoint.teamManage,
      authPoint.memberRead,
      authPoint.memberManage,
      authPoint.reportWrite,
    ]
    for (const point of teamPoints) {
      expect(readAuthDeny(signedIn, point), point).toBe('team')
      expect(readAuthDeny(teamMember, point), point).toBeUndefined()
    }
  })

  it('requires admin for admin rules', () => {
    const adminPoints: TAuthPoint[] = [
      authPoint.userManage,
      authPoint.teamDirectoryManage,
      authPoint.reportManage,
      authPoint.fixtureManage,
      authPoint.seasonManage,
      authPoint.portManage,
    ]
    for (const point of adminPoints) {
      expect(readAuthDeny(signedIn, point), point).toBe('admin')
      expect(readAuthDeny(teamMember, point), point).toBe('admin')
    }
  })

  it('trusts the state flags as given, even if inconsistent', () => {
    // admin/team without signedIn still count, but deny reasons fall back to sign_in
    expect(
      readAuthDeny(
        {signedIn: false, team: false, admin: true},
        authPoint.userSelf,
      ),
    ).toBe('sign_in')
    expect(
      readAuthDeny(
        {signedIn: false, team: true, admin: false},
        authPoint.memberRead,
      ),
    ).toBeUndefined()
    expect(
      readAuthDeny(
        {signedIn: false, team: true, admin: false},
        authPoint.seasonManage,
      ),
    ).toBe('sign_in')
  })
})

describe('canAccessAuthPoint', () => {
  it('mirrors readAuthDeny', () => {
    expect(canAccessAuthPoint(teamMember, authPoint.reportWrite)).toBe(true)
    expect(canAccessAuthPoint(signedIn, authPoint.reportWrite)).toBe(false)
    expect(canAccessAuthPoint(anonymous, authPoint.userSelf)).toBe(false)
    expect(canAccessAuthPoint(admin, authPoint.portManage)).toBe(true)
  })
})
