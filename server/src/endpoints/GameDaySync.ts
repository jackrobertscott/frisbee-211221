import {
  GameDaySyncManualDef,
  GameDaySyncSeasonDef,
  GameDayConfigUpdateDef,
} from '@shared/endpoints/GameDaySyncDef'
import {RequestHandler} from 'micro'
import {$Season} from '../tables/$Season'
import {createEndpoint} from '../utils/endpoints'
import {requireUserAdmin} from './requireUserAdmin'
import {syncSeason, syncAllEnabledSeasons} from '../services/gamedaySeasonSync'

/**
 * GameDay synchronization endpoints
 */
export default new Map<string, RequestHandler>([
  /**
   * Manual sync all enabled seasons
   */
  createEndpoint({
    ...GameDaySyncManualDef,
    handler: () => async (req) => {
      await requireUserAdmin(req)
      console.log('Manual GameDay sync triggered by admin')
      return await syncAllEnabledSeasons()
    },
  }),

  /**
   * Sync a specific season
   */
  createEndpoint({
    ...GameDaySyncSeasonDef,
    handler: (body) => async (req) => {
      await requireUserAdmin(req)
      
      const season = await $Season.getOne({id: body.seasonId})
      if (!season) {
        throw new Error('Season not found')
      }
      
      console.log(`Manual GameDay sync triggered for season: ${season.name}`)
      return await syncSeason(season)
    },
  }),

  /**
   * Update GameDay configuration for a season
   */
  createEndpoint({
    ...GameDayConfigUpdateDef,
    handler: (body) => async (req) => {
      await requireUserAdmin(req)
      
      const season = await $Season.getOne({id: body.seasonId})
      if (!season) {
        throw new Error('Season not found')
      }

      // Validate that if enabled, both league and season IDs are provided
      if (body.enabled && (!body.gamedayLeagueId || !body.gamedaySeasonId)) {
        return {
          success: false,
          message: 'GameDay League ID and Season ID are required when enabling sync',
        }
      }

      // Update the season's GameDay configuration
      await $Season.updateOne({id: body.seasonId}, {
        gamedaySync: {
          enabled: body.enabled,
          gamedayLeagueId: body.gamedayLeagueId,
          gamedaySeasonId: body.gamedaySeasonId,
          // Preserve existing sync status and timestamps if present
          lastSyncDate: season.gamedaySync?.lastSyncDate,
          syncStatus: season.gamedaySync?.syncStatus || 'idle',
          syncErrorMessage: season.gamedaySync?.syncErrorMessage,
        },
        updatedOn: new Date().toISOString(),
      })

      return {
        success: true,
        message: `GameDay sync ${body.enabled ? 'enabled' : 'disabled'} for season ${season.name}`,
      }
    },
  }),
])