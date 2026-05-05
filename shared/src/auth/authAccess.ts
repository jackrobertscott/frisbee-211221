export const authPoint = {
  userSelf: 'user.self',
  userAdmin: 'user.admin',
  teamJoin: 'team.join',
  teamManage: 'team.manage',
  teamAdmin: 'team.admin',
  memberRead: 'member.read',
  memberManage: 'member.manage',
  reportWrite: 'report.write',
  reportManage: 'report.manage',
  fixtureManage: 'fixture.manage',
  seasonManage: 'season.manage',
  postWrite: 'post.write',
  postManage: 'post.manage',
  commentWrite: 'comment.write',
  commentManage: 'comment.manage',
  portManage: 'port.manage',
} as const

export type TAuthPoint = (typeof authPoint)[keyof typeof authPoint]

export type TAuthRule = {
  signedIn?: boolean
  team?: boolean
  admin?: boolean
}

export type TAuthState = {
  signedIn: boolean
  team: boolean
  admin: boolean
}

export type TAuthDeny = 'sign_in' | 'team' | 'admin'

export const authRuleByPoint: Record<TAuthPoint, TAuthRule> = {
  [authPoint.userSelf]: {signedIn: true},
  [authPoint.userAdmin]: {admin: true},
  [authPoint.teamJoin]: {signedIn: true},
  [authPoint.teamManage]: {team: true},
  [authPoint.teamAdmin]: {admin: true},
  [authPoint.memberRead]: {signedIn: true},
  [authPoint.memberManage]: {team: true},
  [authPoint.reportWrite]: {team: true},
  [authPoint.reportManage]: {admin: true},
  [authPoint.fixtureManage]: {admin: true},
  [authPoint.seasonManage]: {admin: true},
  [authPoint.postWrite]: {signedIn: true},
  [authPoint.postManage]: {signedIn: true},
  [authPoint.commentWrite]: {signedIn: true},
  [authPoint.commentManage]: {signedIn: true},
  [authPoint.portManage]: {admin: true},
}

export const readAuthDeny = (state: TAuthState, point: TAuthPoint) => {
  const rule: TAuthRule = authRuleByPoint[point]
  if (rule.admin && !state.admin) return state.signedIn ? 'admin' : 'sign_in'
  if (rule.team && !state.admin && !state.team)
    return state.signedIn ? 'team' : 'sign_in'
  if (rule.signedIn && !state.signedIn) return 'sign_in'
}

export const canAccessAuthPoint = (state: TAuthState, point: TAuthPoint) => {
  return readAuthDeny(state, point) === undefined
}
