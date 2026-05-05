import {badRequestError, conflictError, forbiddenError} from '@shared/errors'
import {TeamCreateDef, TeamCurrentCreateDef, TeamDeleteDef, TeamListOfSeasonDef, TeamUpdateDef, TeamCurrentUpdateDef, TTeamListSortDirection, TTeamListSortKey} from '@shared/endpoints/TeamDef'
import {Document} from 'mongodb'
import {RequestHandler} from 'micro'
import {$Member} from '../tables/$Member'
import {$Season} from '../tables/$Season'
import {$Team} from '../tables/$Team'
import {$User} from '../tables/$User'
import {createEndpoint} from '../utils/endpoints'
import {regex} from '../utils/regex'
import {requireAccess} from './requireAccess'
import {requireTeam} from './requireTeam'

const TEAM_DEFAULT_SORT_BY: TTeamListSortKey = 'division'
const TEAM_DEFAULT_SORT_DIRECTION: TTeamListSortDirection = 'asc'

export default new Map<string, RequestHandler>([

  createEndpoint({
    ...TeamListOfSeasonDef,
    handler: (body) => async (req) => {
      await $Season.getOne({id: body.seasonId})
      const query = {
        seasonId: body.seasonId,
        name: regex.from(body.search ?? ''),
      }
      const sortBy = body.sortBy ?? TEAM_DEFAULT_SORT_BY
      const sortDirection = body.sortDirection ?? TEAM_DEFAULT_SORT_DIRECTION
      const [count, teams] = await Promise.all([
        $Team.count(query),
        $Team.aggregate(
          _getTeamListPipeline(query, sortBy, sortDirection, body.skip, body.limit)
        ),
      ])
      return {count, teams}
    },
  }),

  createEndpoint({
    ...TeamCurrentCreateDef,
    handler: (body, access) => async (req) => {
      const [user] = await requireAccess(req, access)
      const season = await $Season.getOne({id: body.seasonId})
      if (!season.signUpOpen)
        throw badRequestError('Season is not currently open for new team sign ups.', {
          errorCode: 'team.signup_closed',
        })
      if (await $Member.count({userId: user.id, seasonId: season.id}))
        throw conflictError('User is already a member of another team.', {
          errorCode: 'member.already_on_other_team',
        })
      const team = await $Team.createOne(body)
      const member = await $Member.createOne({
        userId: user.id,
        seasonId: team.seasonId,
        teamId: team.id,
        captain: true,
        pending: false,
      })
      await $User.updateOne({id: user.id}, {lastSeasonId: season.id})
      return {
        team,
        member,
      }
    },
  }),

  createEndpoint({
    ...TeamCurrentUpdateDef,
    handler:
      ({teamId, ...body}, access) =>
      async (req) => {
        const [user] = await requireAccess(req, access)
        const [team, member] = await requireTeam(user, teamId)
        if (member.pending)
          throw forbiddenError('Pending members cannot update team information.', {
            errorCode: 'team.pending_member_forbidden',
          })
        return $Team.updateOne(
          {id: team.id},
          {...body, updatedOn: new Date().toISOString()}
        )
      },
  }),

  createEndpoint({
    ...TeamCreateDef,
    handler: (body, access) => async (req) => {
      await requireAccess(req, access)
      await $Season.getOne({id: body.seasonId})
      return $Team.createOne(body)
    },
  }),

  createEndpoint({
    ...TeamUpdateDef,
    handler:
      ({teamId, ...body}, access) =>
      async (req) => {
        await requireAccess(req, access)
        const team = await $Team.getOne({id: teamId})
        return $Team.updateOne(
          {id: team.id},
          {...body, updatedOn: new Date().toISOString()}
        )
      },
  }),

  createEndpoint({
    ...TeamDeleteDef,
    handler:
      ({teamId}, access) =>
      async (req) => {
        await requireAccess(req, access)
        await $Member.deleteMany({teamId})
        await $Team.deleteOne({id: teamId})
      },
  }),
])

const _getTeamSort = (
  sortBy: TTeamListSortKey,
  sortDirection: TTeamListSortDirection,
) => {
  const direction: 1 | -1 = sortDirection === 'asc' ? 1 : -1

  switch (sortBy) {
    case 'name':
      return {name: direction, id: 1 as const}
    case 'division':
      return {
        _sortDivisionMissing: 1 as const,
        division: direction,
        name: 1 as const,
        id: 1 as const,
      }
    case 'phone':
      return {phone: direction, name: 1 as const, id: 1 as const}
    case 'email':
      return {email: direction, name: 1 as const, id: 1 as const}
    case 'createdOn':
      return {createdOn: direction, id: 1 as const}
  }
}

const _getTeamListPipeline = (
  query: Document,
  sortBy: TTeamListSortKey,
  sortDirection: TTeamListSortDirection,
  skip?: number,
  limit?: number,
): Document[] => {
  const pipeline: Document[] = [{$match: query}]

  if (sortBy === 'division') {
    pipeline.push({
      $addFields: {
        _sortDivisionMissing: {
          $in: [{$type: '$division'}, ['missing', 'null']],
        },
      },
    })
  }

  pipeline.push({$sort: _getTeamSort(sortBy, sortDirection)})

  if (skip && skip > 0) pipeline.push({$skip: skip})
  if (limit !== undefined) pipeline.push({$limit: limit})
  if (sortBy === 'division') pipeline.push({$project: {_sortDivisionMissing: 0}})

  return pipeline
}
