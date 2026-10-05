import {TFeatureMvpRow} from '@shared/endpoints/FeatureDef'
import {TSeason} from '@shared/schemas/ioSeason'
import {TTeam} from '@shared/schemas/ioTeam'
import {TUserPublic} from '@shared/schemas/ioUser'
import {
  getSeasonMvpSlots,
  isSeasonMvpSlotEnabled,
} from '@shared/utils/seasonGenderDivision'
import {Document} from 'mongodb'
import {$Team} from '../tables/$Team'
import {$User} from '../tables/$User'

export type TMvpLeaderboardRow = {
  userId: string
  votes: number
  maleVotes: number
  femaleVotes: number
  teamId?: string
}

const GENDER_MALE = 0
const GENDER_FEMALE = 1

/**
 * MVP vote totals per player across the given fixtures. Official scoring
 * gives 5 points to a first pick and 3 to a second; otherwise only first
 * picks count, for 1 point each. Sorted by votes, then division (teams
 * without one last), then player name.
 */
export function getMvpLeaderboardPipeline(
  fixtureIds: string[],
  season: TSeason,
): Document[] {
  const useOfficialScoring = !!season.useOfficialScoring
  const firstPoints = useOfficialScoring ? 5 : 1
  const secondPoints = useOfficialScoring ? 3 : 0
  const slotVotes = (first: string, second: string, gender: number) => [
    {userId: first, points: firstPoints, gender, teamId: '$teamAgainstId'},
    {userId: second, points: secondPoints, gender, teamId: '$teamAgainstId'},
  ]
  const votes: Document[] = [
    ...(isSeasonMvpSlotEnabled(season, 'male')
      ? slotVotes('$mvpMale', '$mvpMale2', GENDER_MALE)
      : []),
    ...(isSeasonMvpSlotEnabled(season, 'female')
      ? slotVotes('$mvpFemale', '$mvpFemale2', GENDER_FEMALE)
      : []),
  ]
  const pointsForGender = (gender: number) => ({
    $sum: {$cond: [{$eq: ['$votes.gender', gender]}, '$votes.points', 0]},
  })
  return [
    {$match: {fixtureId: {$in: fixtureIds}}},
    {
      $project: {
        votes: {
          $filter: {
            input: votes,
            as: 'vote',
            cond: {
              $and: [
                {$eq: [{$type: '$$vote.userId'}, 'string']},
                {$ne: ['$$vote.userId', '']},
                {$gt: ['$$vote.points', 0]},
              ],
            },
          },
        },
      },
    },
    {$unwind: '$votes'},
    {
      $group: {
        _id: '$votes.userId',
        votes: {$sum: '$votes.points'},
        maleVotes: pointsForGender(GENDER_MALE),
        femaleVotes: pointsForGender(GENDER_FEMALE),
        teamId: {$first: '$votes.teamId'},
      },
    },
    {
      $project: {
        _id: 0,
        userId: '$_id',
        votes: 1,
        maleVotes: 1,
        femaleVotes: 1,
        teamId: 1,
      },
    },
    // join the division and player name only to sort by them
    {
      $lookup: {
        from: $Team.key(),
        localField: 'teamId',
        foreignField: 'id',
        pipeline: [
          {$match: {seasonId: season.id}},
          {$project: {_id: 0, division: 1}},
        ],
        as: '_sortTeam',
      },
    },
    {
      $lookup: {
        from: $User.key(),
        localField: 'userId',
        foreignField: 'id',
        pipeline: [{$project: {_id: 0, firstName: 1, lastName: 1}}],
        as: '_sortUser',
      },
    },
    {
      $addFields: {
        _sortDivision: {$arrayElemAt: ['$_sortTeam.division', 0]},
        _sortUserName: {
          $concat: [
            {$ifNull: [{$arrayElemAt: ['$_sortUser.firstName', 0]}, '']},
            ' ',
            {$ifNull: [{$arrayElemAt: ['$_sortUser.lastName', 0]}, '']},
          ],
        },
      },
    },
    {
      $addFields: {
        _sortDivisionMissing: {
          $in: [{$type: '$_sortDivision'}, ['missing', 'null']],
        },
      },
    },
    {
      $sort: {
        votes: -1,
        _sortDivisionMissing: 1,
        _sortDivision: 1,
        _sortUserName: 1,
      },
    },
    {
      $project: {
        _sortTeam: 0,
        _sortUser: 0,
        _sortDivision: 0,
        _sortDivisionMissing: 0,
        _sortUserName: 0,
      },
    },
  ]
}

/**
 * Leaderboard rows in aggregate order. A player's gender comes from their
 * profile, falling back to whichever slot gave them more votes, and players
 * in slots the season does not use are dropped.
 */
export function toMvpRows({
  aggregateRows,
  season,
  teams,
  users,
}: {
  aggregateRows: TMvpLeaderboardRow[]
  season: TSeason
  teams: TTeam[]
  users: TUserPublic[]
}): TFeatureMvpRow[] {
  const teamMap = new Map(teams.map((team) => [team.id, team]))
  const userMap = new Map(users.map((user) => [user.id, user]))
  const slots = getSeasonMvpSlots(season)
  return aggregateRows
    .map((row): TFeatureMvpRow => {
      const user = userMap.get(row.userId)
      const team = row.teamId ? teamMap.get(row.teamId) : undefined
      return {
        userId: row.userId,
        userName: user ? `${user.firstName} ${user.lastName}` : row.userId,
        teamId: team?.id,
        teamName: team?.name,
        division: team?.division,
        votes: row.votes,
        gender: getMvpGender(row, user),
      }
    })
    .filter(
      (row) =>
        row.votes > 0 &&
        ((row.gender === GENDER_MALE && slots.male) ||
          (row.gender === GENDER_FEMALE && slots.female)),
    )
}

function getMvpGender(
  row: TMvpLeaderboardRow,
  user: TUserPublic | undefined,
): number {
  if (user?.gender === 'male') return GENDER_MALE
  if (user?.gender === 'female') return GENDER_FEMALE
  const maleVotes = row.maleVotes ?? 0
  const femaleVotes = row.femaleVotes ?? 0
  return maleVotes > femaleVotes ? GENDER_MALE : GENDER_FEMALE
}
