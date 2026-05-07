import {runStartupSchemaAudit} from './startupSchemaAudit'
import {runStartupSessionMigration} from './startupSessionMigration'

const startupTasks = [runStartupSessionMigration, runStartupSchemaAudit]

export async function runStartupTasks() {
  for (const task of startupTasks) {
    await task()
  }
}