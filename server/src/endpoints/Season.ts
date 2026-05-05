import {
  SeasonCreateDef,
  SeasonListDef,
  SeasonUpdateDef,
} from '@shared/endpoints/SeasonDef'
import {RequestHandler} from 'micro'
import {$Season} from '../tables/$Season'
import {createEndpoint} from '../utils/endpoints'
import {regex} from '../utils/regex'
import {requireAccess} from './requireAccess'

export default new Map<string, RequestHandler>([

  createEndpoint({
    ...SeasonListDef,
    handler: (body) => async () => {
      return $Season.getMany(
        {name: regex.from(body.search ?? '')},
        {sort: {createdOn: -1}}
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
          {...body, updatedOn: new Date().toISOString()}
        )
      },
  }),
])
