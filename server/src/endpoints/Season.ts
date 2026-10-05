import {badRequestError} from '@shared/errors'
import {
  SeasonCreateDef,
  SeasonDeleteDef,
  SeasonDeleteStatusDef,
  SeasonListDef,
  SeasonUpdateDef,
} from '@shared/endpoints/SeasonDef'
import {seasonNameCollation} from '@shared/utils/seasonName'
import {RequestHandler} from 'micro'
import {$Season} from '../tables/$Season'
import {createEndpoint} from '../http/createEndpoint'
import hash from '../auth/hash'
import {regex} from '@shared/utils/regex'
import {requireAccess} from '../auth/requireAccess'
import {
  countSeasonReports,
  deleteSeasonWithData,
} from '../services/seasonDeletion'

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
        return {canDelete: (await countSeasonReports(seasonId)) === 0}
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
        await deleteSeasonWithData(seasonId)
      },
  }),
])
