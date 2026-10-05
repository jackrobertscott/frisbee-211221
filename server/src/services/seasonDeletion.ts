import {conflictError} from '@shared/errors'
import {TReport} from '@shared/schemas/ioReport'
import {Filter} from 'mongodb'
import mongo from '../db/mongo'
import {$Fixture} from '../tables/$Fixture'
import {$GamedayImportConfig} from '../tables/$GamedayImportConfig'
import {$GamedayImportRun} from '../tables/$GamedayImportRun'
import {$Member} from '../tables/$Member'
import {$Report} from '../tables/$Report'
import {$Season} from '../tables/$Season'
import {$Team} from '../tables/$Team'
import {$User} from '../tables/$User'

/** Reports tied to the season through its fixtures or teams. */
export async function countSeasonReports(seasonId: string): Promise<number> {
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

/**
 * Deletes a season and everything hanging off it in one transaction, and
 * clears it as users' last season. Refuses if any reports exist.
 */
export async function deleteSeasonWithData(seasonId: string): Promise<void> {
  await mongo.transaction(async () => {
    if ((await countSeasonReports(seasonId)) > 0) {
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
}
