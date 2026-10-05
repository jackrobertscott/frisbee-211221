import {TSeason} from '@shared/schemas/ioSeason'
import {TUser} from '@shared/schemas/ioUser'
import {
  isUserEligibleForMvpSlot,
  sanitizeSeasonMvpFields,
  TMvpGenderSlot,
  TSeasonMvpFields,
} from '@shared/utils/seasonGenderDivision'
import {$User} from '../tables/$User'

type TMvpUser = Pick<TUser, 'gender'>

/** The non-empty user ids referenced by the MVP fields. */
export function collectMvpUserIds(fields: TSeasonMvpFields): string[] {
  return Object.values(fields).filter(
    (userId): userId is string => typeof userId === 'string' && !!userId,
  )
}

/**
 * Clears MVP picks whose user is known to be ineligible for the slot's
 * gender. Empty picks are cleared; users missing from the map are kept.
 */
export function dropIneligibleMvps(
  fields: TSeasonMvpFields,
  usersById: Map<string, TMvpUser>,
): TSeasonMvpFields {
  const validUserId = (slot: TMvpGenderSlot, userId: string | undefined) => {
    if (!userId) return undefined
    const user = usersById.get(userId)
    if (user && !isUserEligibleForMvpSlot(user, slot)) return undefined
    return userId
  }
  return {
    mvpMale: validUserId('male', fields.mvpMale),
    mvpMale2: validUserId('male', fields.mvpMale2),
    mvpFemale: validUserId('female', fields.mvpFemale),
    mvpFemale2: validUserId('female', fields.mvpFemale2),
  }
}

/**
 * Clears MVP slots the season does not use, then any pick whose user is
 * ineligible for that slot.
 */
export async function sanitizeReportMvps(
  season: TSeason,
  body: TSeasonMvpFields,
): Promise<TSeasonMvpFields> {
  const fields = sanitizeSeasonMvpFields(season, body)
  const userIds = collectMvpUserIds(fields)
  if (!userIds.length) return fields
  const users = await $User.getMany({id: {$in: userIds}})
  return dropIneligibleMvps(
    fields,
    new Map(users.map((user) => [user.id, user])),
  )
}
