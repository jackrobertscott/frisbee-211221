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
import {$Fixture} from '../tables/$Fixture'
import {$GamedayImportConfig} from '../tables/$GamedayImportConfig'
import {$GamedayImportRun} from '../tables/$GamedayImportRun'
import {$Member} from '../tables/$Member'
import {$Report} from '../tables/$Report'
import {$Season} from '../tables/$Season'
import {$Team} from '../tables/$Team'
import {$User} from '../tables/$User'
import {createEndpoint} from '../http/createEndpoint'
import hash from '../auth/hash'
import mongo from '../db/mongo'
import {regex} from '../utils/regex'
import {requireAccess} from '../auth/requireAccess'

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
          await $Member.deleteMany({seasonId})
          await $Fixture.deleteMany({seasonId})
          await $Team.deleteMany({seasonId})
          await $GamedayImportRun.deleteMany({seasonId})
          await $GamedayImportConfig.deleteMany({seasonId})
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
  const idsOnly = [{$match: {seasonId}}, {$project: {_id: 0, id: 1}}]
  const [fixtures, teams] = await Promise.all([
    $Fixture.aggregate<{id: string}>(idsOnly),
    $Team.aggregate<{id: string}>(idsOnly),
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
