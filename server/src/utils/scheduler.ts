import * as cron from 'node-cron';
import { syncAllEnabledSeasons } from '../services/gamedaySeasonSync';
import config from '../config';

/**
 * Initialize GameDay sync scheduler
 */
export function initializeGameDayScheduler(): void {
  if (!config.gameday.clientId || !config.gameday.clientSecret) {
    console.log('GameDay sync scheduler not initialized - missing API credentials');
    return;
  }

  const cronExpression = config.gameday.syncInterval;
  
  if (!cron.validate(cronExpression)) {
    console.error(`Invalid cron expression for GameDay sync: ${cronExpression}`);
    return;
  }

  console.log(`Initializing GameDay sync scheduler with interval: ${cronExpression}`);

  const task = cron.schedule(cronExpression, async () => {
    console.log('Starting scheduled GameDay sync...');
    
    try {
      const results = await syncAllEnabledSeasons();
      
      const successCount = results.filter(r => r.success).length;
      const totalCount = results.length;
      
      console.log(`Scheduled GameDay sync completed: ${successCount}/${totalCount} seasons synced successfully`);
      
      // Log detailed results
      for (const result of results) {
        if (result.success) {
          console.log(`✓ ${result.message} - Users: ${result.stats.usersCreated}/${result.stats.usersUpdated}, Teams: ${result.stats.teamsCreated}/${result.stats.teamsUpdated}, Members: ${result.stats.membersCreated}/${result.stats.membersUpdated}`);
        } else {
          console.error(`✗ ${result.message}${result.error ? `: ${result.error}` : ''}`);
        }
      }
    } catch (error) {
      console.error('Error during scheduled GameDay sync:', error);
    }
  });

  // Start the task
  task.start();
  
  console.log('GameDay sync scheduler started successfully');
}

/**
 * Stop the GameDay sync scheduler (useful for testing or shutdown)
 */
export function stopGameDayScheduler(): void {
  console.log('Stopping GameDay sync scheduler...');
  cron.getTasks().forEach((task) => {
    task.stop();
  });
}

/**
 * Run a manual sync (useful for testing or admin triggers)
 */
export async function runManualSync(): Promise<void> {
  console.log('Running manual GameDay sync...');
  
  try {
    const results = await syncAllEnabledSeasons();
    
    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;
    
    console.log(`Manual GameDay sync completed: ${successCount}/${totalCount} seasons synced successfully`);
    
    // Return results for API responses
    return results as any;
  } catch (error) {
    console.error('Error during manual GameDay sync:', error);
    throw error;
  }
}