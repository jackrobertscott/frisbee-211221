import {
  GamedayAccountSettingsConnectDef,
  GamedayAccountSettingsCreateDef,
  GamedayAccountSettingsDeleteDef,
  GamedayAccountSettingsListOfSeasonDef,
  GamedayAccountSettingsUpdateDef,
} from '@shared/endpoints/GamedayDef'
import {RequestHandler} from 'micro'
import {$GamedayAccountSettings} from '../tables/$GamedayAccountSettings'
import {$Season} from '../tables/$Season'
import {createEndpoint} from '../utils/endpoints'
import {gameday} from '../utils/gameday'
import {requireUserAdmin} from './requireUserAdmin'

export default new Map<string, RequestHandler>([

  createEndpoint({
    ...GamedayAccountSettingsListOfSeasonDef,
    handler: (body: any) => async (req) => {
      await requireUserAdmin(req)
      await $Season.getOne({id: body.seasonId})
      return $GamedayAccountSettings.getMany(
        {seasonId: body.seasonId},
        {sort: {createdOn: -1}}
      )
    },
  }),

  createEndpoint({
    ...GamedayAccountSettingsConnectDef,
    handler: (body: any) => async (req) => {
      await requireUserAdmin(req)
      try {
        const data = await gameday.connect(body)
        return {connectedOn: data.connectedOn}
      } catch (error) {
        throw gameday.digestError(error)
      }
    },
  }),

  createEndpoint({
    ...GamedayAccountSettingsCreateDef,
    handler: ({seasonId, ...body}: any) => async (req) => {
      await requireUserAdmin(req)
      await $Season.getOne({id: seasonId})
      let connectedOn = new Date().toISOString()
      try {
        connectedOn = (await gameday.connect(body)).connectedOn
      } catch (error) {
        throw gameday.digestError(error)
      }
      return $GamedayAccountSettings.createOne({
        seasonId,
        ...body,
        lastConnectedOn: connectedOn,
      })
    },
  }),

  createEndpoint({
    ...GamedayAccountSettingsUpdateDef,
    handler:
      ({gamedayAccountSettingsId, ...body}: any) =>
      async (req) => {
        await requireUserAdmin(req)
        const current = await $GamedayAccountSettings.getOne({
          id: gamedayAccountSettingsId,
        })
        let connectedOn = new Date().toISOString()
        try {
          connectedOn = (await gameday.connect(body)).connectedOn
        } catch (error) {
          throw gameday.digestError(error)
        }
        return $GamedayAccountSettings.updateOne(
          {id: current.id},
          {
            ...body,
            lastConnectedOn: connectedOn,
            updatedOn: new Date().toISOString(),
          }
        )
      },
  }),

  createEndpoint({
    ...GamedayAccountSettingsDeleteDef,
    handler:
      ({gamedayAccountSettingsId}: any) =>
      async (req) => {
        await requireUserAdmin(req)
        await $GamedayAccountSettings.deleteOne({id: gamedayAccountSettingsId})
      },
  }),
])
