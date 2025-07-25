import { GameDayApiClient, GameDayConfig } from '../utils/gameday';
import {
  mapGameDayUserToInternal,
  mapGameDayTeamToInternal,
  mapGameDayRegistrationToMember,
  updateUserWithGameDayData,
  updateTeamWithGameDayData,
  normalizeTeamName,
  normalizeEmail
} from '../utils/gamedayMapping';
import { TSeason } from '@shared/schemas/ioSeason';
import { TMember } from '@shared/schemas/ioMember';
import { $Season } from '../tables/$Season';
import { $User } from '../tables/$User';
import { $Team } from '../tables/$Team';
import { $Member } from '../tables/$Member';
import mongo from '../utils/mongo';
import config from '../config';

export interface SeasonSyncResult {
  success: boolean;
  message: string;
  stats: {
    usersProcessed: number;
    usersCreated: number;
    usersUpdated: number;
    teamsProcessed: number;
    teamsCreated: number;
    teamsUpdated: number;
    membersCreated: number;
    membersUpdated: number;
    membersRemoved: number;
  };
  error?: string;
}

/**
 * Sync a single season with GameDay data
 */
export async function syncSeason(season: TSeason): Promise<SeasonSyncResult> {
  const stats = {
    usersProcessed: 0,
    usersCreated: 0,
    usersUpdated: 0,
    teamsProcessed: 0,
    teamsCreated: 0,
    teamsUpdated: 0,
    membersCreated: 0,
    membersUpdated: 0,
    membersRemoved: 0,
  };

  try {
    // Validate season has required GameDay configuration
    if (!season.gamedaySync || !season.gamedaySync.enabled) {
      return {
        success: false,
        message: 'GameDay sync is not enabled for this season',
        stats,
      };
    }

    if (!season.gamedaySync.gamedayLeagueId || !season.gamedaySync.gamedaySeasonId) {
      return {
        success: false,
        message: 'GameDay league ID and season ID are required for sync',
        stats,
      };
    }

    // Validate GameDay configuration
    if (!config.gameday.clientId || !config.gameday.clientSecret || !config.gameday.baseUrl || !config.gameday.oauthEndpoint) {
      return {
        success: false,
        message: 'GameDay API configuration is incomplete',
        stats,
      };
    }

    // Update season sync status
    const updatedGamedaySync = {
      enabled: season.gamedaySync?.enabled ?? true,
      gamedayLeagueId: season.gamedaySync?.gamedayLeagueId,
      gamedaySeasonId: season.gamedaySync?.gamedaySeasonId,
      lastSyncDate: season.gamedaySync?.lastSyncDate,
      syncStatus: 'syncing' as const,
      syncErrorMessage: undefined,
    };
    await $Season.updateOne({ id: season.id }, {
      gamedaySync: updatedGamedaySync,
    });

    // Initialize GameDay API client
    const gamedayConfig: GameDayConfig = {
      clientId: config.gameday.clientId!,
      clientSecret: config.gameday.clientSecret!,
      oauthEndpoint: config.gameday.oauthEndpoint!,
      baseUrl: config.gameday.baseUrl!,
    };

    const apiClient = new GameDayApiClient(gamedayConfig);

    // Fetch data from GameDay API
    console.log(`Fetching GameDay data for season ${season.name} (League: ${season.gamedaySync.gamedayLeagueId}, Season: ${season.gamedaySync.gamedaySeasonId})`);
    
    const { users: gamedayUsers, teams: gamedayTeams, registrations: gamedayRegistrations } = await apiClient.getLeagueData(
      season.gamedaySync.gamedayLeagueId,
      season.gamedaySync.gamedaySeasonId
    );

    console.log(`Fetched ${gamedayUsers.length} users, ${gamedayTeams.length} teams, ${gamedayRegistrations.length} registrations`);

    // Process all data in a transaction
    await mongo.transaction(async () => {
      // Process users first
      const userIdMap = await processUsers(gamedayUsers, stats);
      
      // Process teams
      const teamIdMap = await processTeams(gamedayTeams, season.id, stats);
      
      // Process member relationships
      await processMembers(gamedayRegistrations, userIdMap, teamIdMap, season.id, stats);
    });

    // Update season sync status to success  
    const successGamedaySync = {
      enabled: season.gamedaySync?.enabled ?? true,
      gamedayLeagueId: season.gamedaySync?.gamedayLeagueId,
      gamedaySeasonId: season.gamedaySync?.gamedaySeasonId,
      syncStatus: 'success' as const,
      lastSyncDate: new Date().toISOString(),
      syncErrorMessage: undefined,
    };
    await $Season.updateOne({ id: season.id }, {
      gamedaySync: successGamedaySync,
    });

    return {
      success: true,
      message: `Successfully synced season ${season.name}`,
      stats,
    };

  } catch (error) {
    console.error(`Error syncing season ${season.name}:`, error);
    
    // Update season sync status to error
    const errorGamedaySync = {
      enabled: season.gamedaySync?.enabled ?? true,
      gamedayLeagueId: season.gamedaySync?.gamedayLeagueId,
      gamedaySeasonId: season.gamedaySync?.gamedaySeasonId,
      lastSyncDate: season.gamedaySync?.lastSyncDate,
      syncStatus: 'error' as const,
      syncErrorMessage: error instanceof Error ? error.message : 'Unknown error occurred',
    };
    await $Season.updateOne({ id: season.id }, {
      gamedaySync: errorGamedaySync,
    });

    return {
      success: false,
      message: `Failed to sync season ${season.name}`,
      stats,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Process GameDay users - create new ones and update existing ones
 */
async function processUsers(gamedayUsers: any[], stats: any): Promise<Map<string, string>> {
  const userIdMap = new Map<string, string>(); // GameDay ID -> Internal ID
  
  for (const gdUser of gamedayUsers) {
    stats.usersProcessed++;
    
    // Try to find existing user by email
    const normalizedEmail = normalizeEmail(gdUser.email);
    let existingUser = await $User.maybeOne({
      $or: [
        { email: normalizedEmail },
        { 'emails.value': normalizedEmail },
        { gamedayId: gdUser.id },
      ],
    });

    if (existingUser) {
      // Update existing user
      const updates = updateUserWithGameDayData(existingUser, gdUser);
      if (Object.keys(updates).length > 0) {
        await $User.updateOne({ id: existingUser.id }, updates);
        stats.usersUpdated++;
      }
      userIdMap.set(gdUser.id, existingUser.id);
    } else {
      // Create new user
      const newUserData = mapGameDayUserToInternal(gdUser);
      const newUser = await $User.createOne(newUserData);
      stats.usersCreated++;
      userIdMap.set(gdUser.id, newUser.id);
    }
  }
  
  return userIdMap;
}

/**
 * Process GameDay teams - create new ones and update existing ones
 */
async function processTeams(gamedayTeams: any[], seasonId: string, stats: any): Promise<Map<string, string>> {
  const teamIdMap = new Map<string, string>(); // GameDay ID -> Internal ID
  
  for (const gdTeam of gamedayTeams) {
    stats.teamsProcessed++;
    
    // Try to find existing team by name within the season or by GameDay ID
    const normalizedName = normalizeTeamName(gdTeam.name);
    let existingTeam = await $Team.maybeOne({
      $or: [
        { seasonId, name: { $regex: new RegExp(`^${normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
        { gamedayId: gdTeam.id },
      ],
    });

    if (existingTeam) {
      // Update existing team
      const updates = updateTeamWithGameDayData(existingTeam, gdTeam);
      if (Object.keys(updates).length > 0) {
        await $Team.updateOne({ id: existingTeam.id }, updates);
        stats.teamsUpdated++;
      }
      teamIdMap.set(gdTeam.id, existingTeam.id);
    } else {
      // Create new team
      const newTeamData = mapGameDayTeamToInternal(gdTeam, seasonId);
      const newTeam = await $Team.createOne(newTeamData);
      stats.teamsCreated++;
      teamIdMap.set(gdTeam.id, newTeam.id);
    }
  }
  
  return teamIdMap;
}

/**
 * Process GameDay registrations - create member relationships
 */
async function processMembers(
  gamedayRegistrations: any[],
  userIdMap: Map<string, string>,
  teamIdMap: Map<string, string>,
  seasonId: string,
  stats: any
): Promise<void> {
  // Get existing members for this season
  const existingMembers = await $Member.getMany({ seasonId });
  const existingMemberMap = new Map<string, TMember>();
  
  // Map existing members by user-team combination
  for (const member of existingMembers) {
    const key = `${member.userId}-${member.teamId}`;
    existingMemberMap.set(key, member);
  }

  // Track which members should exist (from GameDay)
  const validMemberKeys = new Set<string>();

  // Process each registration
  for (const registration of gamedayRegistrations) {
    // Skip registrations without team assignments
    if (!registration.teamId || registration.role === 'volunteer') {
      continue;
    }

    const internalUserId = userIdMap.get(registration.userId);
    const internalTeamId = teamIdMap.get(registration.teamId);

    if (!internalUserId || !internalTeamId) {
      console.warn(`Skipping registration ${registration.id} - missing user or team mapping`);
      continue;
    }

    const memberKey = `${internalUserId}-${internalTeamId}`;
    validMemberKeys.add(memberKey);
    
    const existingMember = existingMemberMap.get(memberKey);

    if (existingMember) {
      // Update existing member if needed
      const newCaptainStatus = registration.role === 'coach';
      const newPendingStatus = registration.status !== 'active';
      
      if (
        existingMember.captain !== newCaptainStatus ||
        existingMember.pending !== newPendingStatus ||
        existingMember.gamedayRegistrationId !== registration.id
      ) {
        await $Member.updateOne({ id: existingMember.id }, {
          captain: newCaptainStatus,
          pending: newPendingStatus,
          gamedayRegistrationId: registration.id,
        });
        stats.membersUpdated++;
      }
    } else {
      // Create new member
      const newMemberData = mapGameDayRegistrationToMember(
        registration,
        internalUserId,
        internalTeamId,
        seasonId
      );
      await $Member.createOne(newMemberData);
      stats.membersCreated++;
    }
  }

  // Remove members that are no longer in GameDay data (but only those with GameDay registration IDs)
  for (const [memberKey, member] of existingMemberMap) {
    if (!validMemberKeys.has(memberKey) && member.gamedayRegistrationId) {
      await $Member.deleteOne({ id: member.id });
      stats.membersRemoved++;
    }
  }
}

/**
 * Sync all seasons that have GameDay sync enabled
 */
export async function syncAllEnabledSeasons(): Promise<SeasonSyncResult[]> {
  console.log('Starting sync for all enabled seasons...');
  
  const enabledSeasons = await $Season.getMany({
    'gamedaySync.enabled': true,
    'gamedaySync.gamedayLeagueId': { $exists: true, $ne: null },
    'gamedaySync.gamedaySeasonId': { $exists: true, $ne: null },
  });

  console.log(`Found ${enabledSeasons.length} seasons with GameDay sync enabled`);

  const results: SeasonSyncResult[] = [];
  
  for (const season of enabledSeasons) {
    console.log(`Syncing season: ${season.name}`);
    const result = await syncSeason(season);
    results.push(result);
    
    // Add a small delay between seasons to avoid overwhelming the API
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  const successCount = results.filter(r => r.success).length;
  console.log(`Completed sync for ${enabledSeasons.length} seasons. ${successCount} successful, ${enabledSeasons.length - successCount} failed.`);

  return results;
}