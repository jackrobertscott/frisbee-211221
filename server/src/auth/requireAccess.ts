import {authRuleByPoint, TAuthPoint} from '@shared/auth/authAccess'
import {forbiddenError} from '@shared/errors'
import {IncomingMessage} from 'http'
import {$Member} from '../tables/$Member'
import {requireUser} from './requireUser'

export const requireAccess = async (
  req: IncomingMessage,
  point: TAuthPoint,
) => {
  const [user, session] = await requireUser(req)
  const rule = authRuleByPoint[point]
  if (rule.admin && !user.admin) {
    throw forbiddenError('Failed because user is not an admin.', {
      errorCode: 'auth.admin_required',
    })
  }
  if (rule.team && !user.admin) {
    const member = await $Member.maybeOne({
      userId: user.id,
      pending: false,
    })
    if (!member) {
      throw forbiddenError('Failed because user is not on a team.', {
        errorCode: 'auth.team_required',
      })
    }
  }
  return [user, session] as const
}
