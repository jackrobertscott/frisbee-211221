import {runFixSchemaAuditDataMigration} from '../migrations/fixSchemaAuditData'
import {runStartupSchemaAudit} from './startupSchemaAudit'

const startupTasks = [runFixSchemaAuditDataMigration, runStartupSchemaAudit]

export async function runStartupTasks() {
  for (const task of startupTasks) {
    await task()
  }
}