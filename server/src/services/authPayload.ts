import {TSession} from '@shared/schemas/ioSession'
import {TTeam} from '@shared/schemas/ioTeam'
import {TUser, TUserSafe} from '@shared/schemas/ioUser'
import {$Member} from '../tables/$Member'
import {$Season} from '../tables/$Season'
import {$Team} from '../tables/$Team'
import {$User} from '../tables/$User'
import {selectSafeUserFields} from './userFields'

export interface TAuthPayload {
  user: TUserSafe
  session: TSession
  team?: TTeam
}

/**
 * The signed-in user's session payload. With a season it also includes the
 * user's confirmed team in that season and records it as their last season.
 */
export const buildAuthPayload = async (
  rawUser: TUser,
  session: TSession,
  seasonId?: string,
): Promise<TAuthPayload> => {
  let user = rawUser
  let team: TTeam | undefined
  if (seasonId) {
    const season = await $Season.getOne({id: seasonId})
    const member = await $Member.maybeOne({
      userId: user.id,
      seasonId: seasonId,
      pending: false,
    })
    team = member ? await $Team.getOne({id: member.teamId}) : undefined
    if (user.lastSeasonId !== season.id) {
      user = await $User.updateOne({id: user.id}, {lastSeasonId: season.id})
    }
  }
  return {
    user: selectSafeUserFields(user),
    session,
    team,
  }
}
