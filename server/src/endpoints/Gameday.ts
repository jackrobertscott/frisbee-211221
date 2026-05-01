import {
  GamedayAccountSettingsConnectDef,
  GamedayAccountSettingsCreateDef,
  GamedayAccountSettingsDeleteDef,
  GamedayAccountSettingsListOfSeasonDef,
  GamedayAccountSettingsUpdateDef,
} from '@shared/endpoints/GamedayDef'
import {RequestHandler} from 'micro'
import {
  $GamedayAccountSettings,
  TGamedayAccountSettingsRecord,
} from '../tables/$GamedayAccountSettings'
import {badRequestError} from '@shared/errors'
import {$Season} from '../tables/$Season'
import {createEndpoint} from '../utils/endpoints'
import {gameday} from '../utils/gameday'
import {secretBox} from '../utils/secretBox'
import {requireUserAdmin} from './requireUserAdmin'

const toSafeGamedayAccount = (account: TGamedayAccountSettingsRecord) => ({
  id: account.id,
  createdOn: account.createdOn,
  updatedOn: account.updatedOn,
  seasonId: account.seasonId,
  name: account.name,
  organisationId: account.organisationId,
  tokenUrl: account.tokenUrl,
  apiBaseUrl: account.apiBaseUrl,
  clientId: account.clientId,
  grantType: account.grantType,
  scope: account.scope,
  lastConnectedOn: account.lastConnectedOn,
  hasOauthClientSecret: Boolean(account.encryptedOauthClientSecret.trim()),
})

const getStoredOauthClientSecret = async (
  account: TGamedayAccountSettingsRecord
) => {
  if (!account.encryptedOauthClientSecret.trim())
    throw badRequestError('GameDay OAuth client secret is required.', {
      errorCode: 'gameday.oauth_client_secret_missing',
    })
  return secretBox.decrypt(account.encryptedOauthClientSecret)
}

const buildConnectionInput = async (
  body: {
    organisationId: string
    tokenUrl: string
    apiBaseUrl: string
    clientId: string
    oauthClientSecret?: string
    grantType: string
    scope?: string
  },
  account?: TGamedayAccountSettingsRecord
) => ({
  ...body,
  oauthClientSecret: body.oauthClientSecret?.trim()
    ? body.oauthClientSecret.trim()
    : account
      ? await getStoredOauthClientSecret(account)
      : '',
})

export default new Map<string, RequestHandler>([

  createEndpoint({
    ...GamedayAccountSettingsListOfSeasonDef,
    handler: (body: any) => async (req) => {
      await requireUserAdmin(req)
      await $Season.getOne({id: body.seasonId})
      const accounts = await $GamedayAccountSettings.getMany(
        {seasonId: body.seasonId},
        {sort: {createdOn: -1}}
      )
      return accounts.map(toSafeGamedayAccount)
    },
  }),

  createEndpoint({
    ...GamedayAccountSettingsConnectDef,
    handler: (body: any) => async (req) => {
      await requireUserAdmin(req)
      const current = body.gamedayAccountSettingsId
        ? await $GamedayAccountSettings.getOne({
            id: body.gamedayAccountSettingsId,
          })
        : undefined
      const connection = await buildConnectionInput(body, current)
      if (!connection.oauthClientSecret.trim()) {
        throw badRequestError('GameDay OAuth client secret is required.', {
          errorCode: 'gameday.oauth_client_secret_missing',
        })
      }
      try {
        const data = await gameday.connect(connection)
        return {connectedOn: data.connectedOn}
      } catch (error) {
        throw gameday.digestError(error)
      }
    },
  }),

  createEndpoint({
    ...GamedayAccountSettingsCreateDef,
    handler: ({seasonId, oauthClientSecret, ...body}: any) => async (req) => {
      await requireUserAdmin(req)
      await $Season.getOne({id: seasonId})
      const connection = await buildConnectionInput({
        ...body,
        oauthClientSecret,
      })
      let connectedOn = new Date().toISOString()
      try {
        connectedOn = (await gameday.connect(connection)).connectedOn
      } catch (error) {
        throw gameday.digestError(error)
      }
      return $GamedayAccountSettings.createOne({
        seasonId,
        ...body,
        encryptedOauthClientSecret: secretBox.encrypt(
          connection.oauthClientSecret
        ),
        lastConnectedOn: connectedOn,
      }).then(toSafeGamedayAccount)
    },
  }),

  createEndpoint({
    ...GamedayAccountSettingsUpdateDef,
    handler:
      ({gamedayAccountSettingsId, oauthClientSecret, ...body}: any) =>
      async (req) => {
        await requireUserAdmin(req)
        const current = await $GamedayAccountSettings.getOne({
          id: gamedayAccountSettingsId,
        })
        const connection = await buildConnectionInput(
          {...body, oauthClientSecret},
          current
        )
        if (!connection.oauthClientSecret.trim()) {
          throw badRequestError('GameDay OAuth client secret is required.', {
            errorCode: 'gameday.oauth_client_secret_missing',
          })
        }
        let connectedOn = new Date().toISOString()
        try {
          connectedOn = (await gameday.connect(connection)).connectedOn
        } catch (error) {
          throw gameday.digestError(error)
        }
        return $GamedayAccountSettings.updateOne(
          {id: current.id},
          {
            ...body,
            encryptedOauthClientSecret: oauthClientSecret?.trim()
              ? secretBox.encrypt(oauthClientSecret.trim())
              : current.encryptedOauthClientSecret,
            lastConnectedOn: connectedOn,
            updatedOn: new Date().toISOString(),
          }
        ).then(toSafeGamedayAccount)
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
