import {TUser} from '../../../shared/src/schemas/ioUser'
import {$Member} from '../tables/$Member'
import {$Team} from '../tables/$Team'
/**
 *
 */
export const requireTeam = async (user: TUser, teamId: string) => {
  const team = await $Team.getOne({id: teamId})
  const member = await $Member.getOne({
    teamId: team.id,
    userId: user.id,
    pending: false,
  })
  if (!member)
    throw new Error(`User does not have sufficient access privileges.`)
  return [team, member] as const
}
