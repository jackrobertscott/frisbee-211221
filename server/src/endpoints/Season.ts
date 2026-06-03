import {badRequestError, conflictError} from '@shared/errors'
import {
  SeasonCreateDef,
  SeasonDeleteDef,
  SeasonDeleteStatusDef,
  SeasonListDef,
  SeasonUpdateDef,
} from '@shared/endpoints/SeasonDef'
import {TReport} from '@shared/schemas/ioReport'
import {seasonNameCollation} from '@shared/utils/seasonName'
import {Filter} from 'mongodb'
import {RequestHandler} from 'micro'
import {$Comment} from '../tables/$Comment'
import {$Fixture} from '../tables/$Fixture'
import {$Member} from '../tables/$Member'
import {$Post} from '../tables/$Post'
import {$Report} from '../tables/$Report'
import {$Season} from '../tables/$Season'
import {$Team} from '../tables/$Team'
import {$User} from '../tables/$User'
import {createEndpoint} from '../utils/endpoints'
import hash from '../utils/hash'
import mongo from '../utils/mongo'
import {regex} from '../utils/regex'
import {requireAccess} from './requireAccess'

export default new Map<string, RequestHandler>([
  createEndpoint({
    ...SeasonListDef,
    handler: (body) => async () => {
      return $Season.getMany(
        {name: regex.from(body.search ?? '')},
        {
          sort: {name: -1 as const},
          collation: seasonNameCollation,
        },
      )
    },
  }),

  createEndpoint({
    ...SeasonCreateDef,
    handler: (body, access) => async (req) => {
      await requireAccess(req, access)
      return $Season.createOne(body)
    },
  }),

  createEndpoint({
    ...SeasonUpdateDef,
    handler:
      ({seasonId, ...body}, access) =>
      async (req) => {
        await requireAccess(req, access)
        return $Season.updateOne(
          {id: seasonId},
          {...body, updatedOn: new Date().toISOString()},
        )
      },
  }),

  createEndpoint({
    ...SeasonDeleteStatusDef,
    handler:
      ({seasonId}, access) =>
      async (req) => {
        await requireAccess(req, access)
        await $Season.getOne({id: seasonId})
        return {canDelete: (await _countSeasonReports(seasonId)) === 0}
      },
  }),

  createEndpoint({
    ...SeasonDeleteDef,
    handler:
      ({seasonId, password}, access) =>
      async (req) => {
        const [user] = await requireAccess(req, access)
        if (!user.password)
          throw badRequestError('User does not have a password.', {
            errorCode: 'user.password_missing',
          })
        if (!(await hash.compare(password, user.password)))
          throw badRequestError('Password is incorrect.', {
            errorCode: 'user.old_password_invalid',
          })
        await $Season.getOne({id: seasonId})
        await mongo.transaction(async () => {
          if ((await _countSeasonReports(seasonId)) > 0) {
            throw conflictError('Season has score reports.', {
              errorCode: 'season.delete_has_reports',
            })
          }
          const posts = await $Post.getMany({seasonId})
          const postIds = posts.map((post) => post.id)
          if (postIds.length) await $Comment.deleteMany({postId: {$in: postIds}})
          await $Post.deleteMany({seasonId})
          await $Member.deleteMany({seasonId})
          await $Fixture.deleteMany({seasonId})
          await $Team.deleteMany({seasonId})
          await $User.updateMany(
            {lastSeasonId: seasonId},
            {
              lastSeasonId: undefined,
              updatedOn: new Date().toISOString(),
            },
          )
          await $Season.deleteOne({id: seasonId})
        })
      },
  }),
])

async function _countSeasonReports(seasonId: string): Promise<number> {
  const [fixtures, teams] = await Promise.all([
    $Fixture.getMany({seasonId}),
    $Team.getMany({seasonId}),
  ])
  const fixtureIds = fixtures.map((fixture) => fixture.id)
  const teamIds = teams.map((team) => team.id)
  const reportQueries: Array<Filter<TReport>> = []
  if (fixtureIds.length) reportQueries.push({fixtureId: {$in: fixtureIds}})
  if (teamIds.length) {
    reportQueries.push(
      {teamId: {$in: teamIds}},
      {teamAgainstId: {$in: teamIds}},
    )
  }
  if (!reportQueries.length) return 0
  return $Report.count({$or: reportQueries})
}
