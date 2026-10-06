import {
  FALLBACK_USER_GENDER_MATCHING,
  normalizeUserGenderMatching,
  TUserGenderMatching,
  USER_GENDER_MATCHINGS,
} from '@shared/schemas/ioUserGenderMatching'
import {$Report} from '../tables/$Report'
import {$User} from '../tables/$User'

type TLegacyGenderUser = {
  id: string
  gender?: unknown
  genderMatching?: unknown
}

type TMvpSlotPicks = {
  userId: string
  malePicks: number
  femalePicks: number
}

/**
 * Backfills `genderMatching` on users still stored with the old `gender`
 * field. Male and female carry over; anyone else (non-binary, other) gets the
 * MVP slot they were picked in most, or the fallback when there is no clear
 * winner. The old `gender` field is removed. Users that are already migrated
 * are not matched, so this is a no-op after the first run.
 */
export async function runUserGenderMatchingMigration() {
  const pending: TLegacyGenderUser[] = []
  await $User.scanStored(
    (record) => {
      if (isLegacyGenderUser(record)) pending.push(record)
    },
    {genderMatching: {$nin: [...USER_GENDER_MATCHINGS]}},
  )
  if (!pending.length) return

  console.log(`Backfilling gender matching for ${pending.length} users...`)

  const unmatchedIds = pending
    .filter((user) => !readStoredGenderMatching(user))
    .map((user) => user.id)
  const picksByUserId = await getMvpSlotPicks(unmatchedIds)

  const counts: Record<TUserGenderMatching, number> = {male: 0, female: 0}
  let fromVotes = 0
  for (const user of pending) {
    const stored = readStoredGenderMatching(user)
    const voted = stored ? undefined : pickMajoritySlot(picksByUserId.get(user.id))
    if (voted) fromVotes += 1
    const genderMatching = stored ?? voted ?? FALLBACK_USER_GENDER_MATCHING
    await $User.updateAtomic(
      {id: user.id},
      {$set: {genderMatching}, $unset: {gender: ''}},
    )
    counts[genderMatching] += 1
  }

  console.log(
    [
      'Gender matching backfill results:',
      `- male: ${counts.male}`,
      `- female: ${counts.female}`,
      `- non-binary/other assigned from MVP votes: ${fromVotes}`,
      `- non-binary/other assigned ${FALLBACK_USER_GENDER_MATCHING} by default: ${
        unmatchedIds.length - fromVotes
      }`,
    ].join('\n'),
  )
}

function isLegacyGenderUser(record: unknown): record is TLegacyGenderUser {
  return (
    typeof record === 'object' &&
    record !== null &&
    'id' in record &&
    typeof record.id === 'string'
  )
}

function readStoredGenderMatching(
  user: TLegacyGenderUser,
): TUserGenderMatching | undefined {
  for (const value of [user.genderMatching, user.gender]) {
    if (typeof value !== 'string') continue
    const genderMatching = normalizeUserGenderMatching(value)
    if (genderMatching) return genderMatching
  }
  return undefined
}

function pickMajoritySlot(
  picks: TMvpSlotPicks | undefined,
): TUserGenderMatching | undefined {
  if (!picks || picks.malePicks === picks.femalePicks) return undefined
  return picks.malePicks > picks.femalePicks ? 'male' : 'female'
}

/** How many times each user was picked in a male or female MVP slot. */
async function getMvpSlotPicks(
  userIds: string[],
): Promise<Map<string, TMvpSlotPicks>> {
  if (!userIds.length) return new Map()
  const rows = await $Report.aggregate<TMvpSlotPicks>([
    {
      $match: {
        $or: [
          {mvpMale: {$in: userIds}},
          {mvpMale2: {$in: userIds}},
          {mvpFemale: {$in: userIds}},
          {mvpFemale2: {$in: userIds}},
        ],
      },
    },
    {
      $project: {
        picks: [
          {userId: '$mvpMale', slot: 'male'},
          {userId: '$mvpMale2', slot: 'male'},
          {userId: '$mvpFemale', slot: 'female'},
          {userId: '$mvpFemale2', slot: 'female'},
        ],
      },
    },
    {$unwind: '$picks'},
    {$match: {'picks.userId': {$in: userIds}}},
    {
      $group: {
        _id: '$picks.userId',
        malePicks: {$sum: {$cond: [{$eq: ['$picks.slot', 'male']}, 1, 0]}},
        femalePicks: {$sum: {$cond: [{$eq: ['$picks.slot', 'female']}, 1, 0]}},
      },
    },
    {$project: {_id: 0, userId: '$_id', malePicks: 1, femalePicks: 1}},
  ])
  return new Map(rows.map((row) => [row.userId, row]))
}
