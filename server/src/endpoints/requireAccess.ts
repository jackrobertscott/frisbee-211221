import {authPoint, TAuthPoint} from '@shared/auth/authAccess'
import {forbiddenError, unreachableError} from '@shared/errors'
import {IncomingMessage} from 'http'
import {$Member} from '../tables/$Member'
import {requireUser} from './requireUser'
import {requireUserAdmin} from './requireUserAdmin'

const requireUserTeam = async (req: IncomingMessage) => {
  const [user, session] = await requireUser(req)
  if (user.admin) return [user, session] as const
  const member = await $Member.maybeOne({
    userId: user.id,
    pending: false,
  })
  if (!member) {
    throw forbiddenError('Failed because user is not on a team.', {
      errorCode: 'auth.team_required',
    })
  }
  return [user, session] as const
}

export const requireAccess = async (
  req: IncomingMessage,
  point: TAuthPoint
) => {
  switch (point) {
    case authPoint.userSelf:
    case authPoint.teamJoin:
    case authPoint.memberRead:
    case authPoint.postWrite:
    case authPoint.postManage:
    case authPoint.commentWrite:
    case authPoint.commentManage:
      return requireUser(req)
    case authPoint.teamManage:
    case authPoint.memberManage:
    case authPoint.reportWrite:
      return requireUserTeam(req)
    case authPoint.userAdmin:
    case authPoint.teamAdmin:
    case authPoint.reportManage:
    case authPoint.fixtureManage:
    case authPoint.seasonManage:
    case authPoint.portManage:
      return requireUserAdmin(req)
    default:
      return unreachableError(`Unhandled auth point "${point}".`)
  }
}
