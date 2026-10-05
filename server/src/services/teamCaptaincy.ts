import {forbiddenError} from '@shared/errors'
import {TMember} from '@shared/schemas/ioMember'
import {TUser} from '@shared/schemas/ioUser'
import {requireTeam} from '../auth/requireTeam'

/**
 * Admins pass straight through. Anyone else must be an active member of the
 * team and its captain (or satisfy `allowMember`), otherwise this throws a
 * `member.captain_required` error with the given message.
 */
export async function requireCaptainOrAdmin(
  user: Pick<TUser, 'id' | 'admin'>,
  teamId: string,
  message: string,
  allowMember?: (member: TMember) => boolean,
): Promise<void> {
  if (user.admin) return
  const [, member] = await requireTeam(user, teamId)
  if (member.captain || allowMember?.(member)) return
  throw forbiddenError(message, {errorCode: 'member.captain_required'})
}
